use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

use crate::routes;
use crate::state::AppState;

pub fn create_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Public routes — no auth required (health probes only)
    let public_routes = Router::new()
        .route("/health", get(routes::health::health_check));

    // Protected routes — require VYOTIQ_AUTH_TOKEN when configured
    let protected_routes = Router::new()
        // Graceful shutdown (requires auth to prevent unauthorized termination)
        .route("/shutdown", post(routes::health::shutdown_handler))
        // Workspace management
        .route("/api/workspaces", get(routes::workspace::list_workspaces))
        .route("/api/workspaces", post(routes::workspace::create_workspace))
        .route(
            "/api/workspaces/{workspace_id}",
            get(routes::workspace::get_workspace),
        )
        .route(
            "/api/workspaces/{workspace_id}",
            delete(routes::workspace::remove_workspace),
        )
        .route(
            "/api/workspaces/{workspace_id}/activate",
            post(routes::workspace::activate_workspace),
        )
        // File explorer
        .route(
            "/api/workspaces/{workspace_id}/files",
            get(routes::files::list_files),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/read",
            post(routes::files::read_file).get(routes::files::read_file_query),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/write",
            post(routes::files::write_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/create",
            post(routes::files::create_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/delete",
            post(routes::files::delete_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/rename",
            post(routes::files::rename_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/move",
            post(routes::files::move_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/copy",
            post(routes::files::copy_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/stat",
            post(routes::files::stat_file),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/search",
            post(routes::files::search_files),
        )
        .route(
            "/api/workspaces/{workspace_id}/files/mkdir",
            post(routes::files::create_directory),
        )
        // Indexing & search
        .route(
            "/api/workspaces/{workspace_id}/index",
            post(routes::search::index_workspace),
        )
        .route(
            "/api/workspaces/{workspace_id}/index/status",
            get(routes::search::index_status),
        )
        .route(
            "/api/workspaces/{workspace_id}/search",
            post(routes::search::fulltext_search),
        )
        .route(
            "/api/workspaces/{workspace_id}/search/grep",
            post(routes::search::grep_search),
        )
        // WebSocket for real-time events
        .route("/ws", get(ws_handler))
        .layer(axum::middleware::from_fn(auth_middleware));

    public_routes
        .merge(protected_routes)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(cors)
        .with_state(state)
}

/// Middleware that validates `Authorization: Bearer <token>` against the
/// `VYOTIQ_AUTH_TOKEN` environment variable.  If the env var is not set or
/// empty, auth is skipped (development mode).
async fn auth_middleware(req: Request, next: Next) -> Result<Response, (StatusCode, axum::Json<serde_json::Value>)> {
    // Read expected token from env.  Cache via OnceLock so we only read once.
    use std::sync::OnceLock;
    static AUTH_TOKEN: OnceLock<Option<String>> = OnceLock::new();
    let expected = AUTH_TOKEN.get_or_init(|| {
        std::env::var("VYOTIQ_AUTH_TOKEN")
            .ok()
            .filter(|t| !t.is_empty())
    });

    let expected_token = match expected {
        Some(t) => t.as_str(),
        None => return Ok(next.run(req).await), // No token configured — skip auth
    };

    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.len() > 7 && header[..7].eq_ignore_ascii_case("bearer ") => {
            let token = &header[7..];
            if token == expected_token {
                Ok(next.run(req).await)
            } else {
                tracing::warn!("Auth token mismatch — rejecting request");
                Err((
                    StatusCode::UNAUTHORIZED,
                    axum::Json(serde_json::json!({"error": "Unauthorized", "status": 401})),
                ))
            }
        }
        _ => {
            tracing::warn!("Missing or malformed Authorization header — rejecting request");
            Err((
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({"error": "Unauthorized", "status": 401})),
            ))
        }
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// Bidirectional WebSocket handler
/// Server → Client: broadcasts ServerEvents as JSON (filtered by subscribed workspaces)
/// Client → Server: accepts commands for real-time operations
async fn handle_socket(socket: WebSocket, state: AppState) {
    tracing::info!("WebSocket client connected");
    let mut rx = state.event_tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    // Shared set of subscribed workspace IDs.
    // Arc<parking_lot::Mutex<HashSet>> for cross-task communication.
    let subscribed: Arc<parking_lot::Mutex<std::collections::HashSet<String>>> =
        Arc::new(parking_lot::Mutex::new(std::collections::HashSet::new()));
    let subscribed_for_send = subscribed.clone();

    // Server → Client: forward broadcast events, filtered by subscription
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    // Filter: only send events for subscribed workspaces
                    // If no subscriptions yet, send all events (backward compat)
                    {
                        let subs = subscribed_for_send.lock();
                        if !subs.is_empty() && !subs.contains(event.workspace_id()) {
                            continue;
                        }
                    }
                    if let Ok(json) = serde_json::to_string(&event) {
                        if sender
                            .send(Message::Text(json.into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    // Channel backpressure: skip missed events and continue
                    tracing::warn!("WebSocket client lagged, skipped {} events", n);
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    });

    // Client → Server: handle incoming commands
    let index_manager = state.index_manager.clone();
    let workspace_manager = state.workspace_manager.clone();
    let event_tx = state.event_tx.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                let text_str: &str = &text;
                if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(text_str) {
                    let cmd_type = cmd.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    tracing::debug!(command = cmd_type, "WebSocket command received");
                    match cmd_type {
                        "reindex_file" => {
                            let ws_id = cmd.get("workspace_id").and_then(|v| v.as_str()).unwrap_or("");
                            let file_path = cmd.get("path").and_then(|v| v.as_str()).unwrap_or("");
                            let change_type = cmd.get("change_type").and_then(|v| v.as_str()).unwrap_or("modify");

                            if !ws_id.is_empty() && !file_path.is_empty() {
                                // Validate the file path against the workspace to prevent path traversal
                                if let Err(e) = workspace_manager.validate_path(ws_id, file_path) {
                                    tracing::warn!("WebSocket reindex_file path validation failed: {}", e);
                                } else if let Ok(ws) = workspace_manager.get_workspace(ws_id) {
                                    if let Err(e) = index_manager
                                        .reindex_file(ws_id, file_path, &ws.path, change_type)
                                        .await
                                    {
                                        tracing::warn!("Incremental reindex failed: {}", e);
                                    }
                                }
                            }
                        }
                        "subscribe_workspace" => {
                            // Client registers for workspace-specific events
                            if let Some(ws_id) = cmd.get("workspace_id").and_then(|v| v.as_str()) {
                                subscribed.lock().insert(ws_id.to_string());
                                tracing::debug!("Client subscribed to workspace: {}", ws_id);
                            }
                        }
                        "unsubscribe_workspace" => {
                            // Client unregisters from workspace events
                            if let Some(ws_id) = cmd.get("workspace_id").and_then(|v| v.as_str()) {
                                subscribed.lock().remove(ws_id);
                                tracing::debug!("Client unsubscribed from workspace: {}", ws_id);
                            }
                        }
                        "trigger_index" => {
                            let ws_id = cmd.get("workspace_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            if !ws_id.is_empty() {
                                if let Ok(ws) = workspace_manager.get_workspace(&ws_id) {
                                    crate::routes::search::spawn_background_indexing(
                                        ws_id,
                                        ws.path.clone(),
                                        index_manager.clone(),
                                        workspace_manager.clone(),
                                        event_tx.clone(),
                                    );
                                }
                            }
                        }
                        _ => {
                            tracing::debug!("Unknown WS command: {}", cmd_type);
                        }
                    }
                }
            }
        }
    });

    // Wait for either task to finish, then abort the other to prevent leaks
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        },
        _ = &mut recv_task => {
            send_task.abort();
        },
    }
    tracing::info!("WebSocket client disconnected");
}
