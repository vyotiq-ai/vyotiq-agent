use axum::{
    extract::{Path, State},
    Json,
};

use crate::error::AppResult;
use crate::search::{self, GrepQuery, GrepResponse, SearchQuery, SearchResponse};
use crate::state::AppState;

/// Spawn a background task that runs full-text indexing.
/// This deduplicates the identical pattern used in index_workspace, create_workspace,
/// activate_workspace, and trigger_index WS commands.
/// Each inner function has its own CAS guard + smart hash dedup, so duplicate
/// calls are safe (they'll skip work if nothing changed).  However, we check
/// `is_indexing` up-front to avoid spawning a task that immediately bails out.
pub fn spawn_background_indexing(
    workspace_id: String,
    workspace_path: String,
    index_manager: std::sync::Arc<crate::indexer::IndexManager>,
    workspace_manager: std::sync::Arc<crate::workspace::WorkspaceManager>,
    event_tx: tokio::sync::broadcast::Sender<crate::state::ServerEvent>,
) {
    // Quick pre-check: skip spawning if full-text is already indexing
    if let Ok(status) = index_manager.get_index_status(&workspace_id) {
        if status.is_indexing {
            tracing::info!(
                "Skipping spawn_background_indexing for {} — full-text indexing already in progress",
                workspace_id
            );
            return;
        }
    }

    tokio::spawn(async move {
        // Full-text indexing (Tantivy)
        if let Err(e) = index_manager.index_workspace(&workspace_id, &workspace_path, event_tx.clone()).await {
            tracing::error!("Full-text indexing failed for {}: {}", workspace_id, e);
            let _ = event_tx.send(crate::state::ServerEvent::IndexingError {
                workspace_id: workspace_id.clone(),
                error: e.to_string(),
            });
        } else {
            let status = index_manager
                .get_index_status(&workspace_id)
                .unwrap_or_default();
            let _ = workspace_manager.update_workspace_stats(
                &workspace_id,
                status.indexed_count,
                status.total_size_bytes,
                true,
            );

            // Emit SearchReady when indexing is complete
            let _ = event_tx.send(crate::state::ServerEvent::SearchReady {
                workspace_id: workspace_id.clone(),
            });
        }
    });
}

pub async fn index_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let ws = state.workspace_manager.get_workspace(&workspace_id)?;

    // Check if indexing is already in progress — avoid redundant spawns
    let status = state.index_manager.get_index_status(&workspace_id).unwrap_or_default();
    if status.is_indexing {
        return Ok(Json(serde_json::json!({
            "status": "already_indexing",
            "workspace_id": workspace_id,
        })));
    }

    spawn_background_indexing(
        workspace_id.clone(),
        ws.path.clone(),
        state.index_manager.clone(),
        state.workspace_manager.clone(),
        state.event_tx.clone(),
    );

    Ok(Json(serde_json::json!({
        "status": "indexing_started",
        "workspace_id": workspace_id,
    })))
}

pub async fn index_status(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let status = state.index_manager.get_index_status(&workspace_id)?;

    Ok(Json(serde_json::json!({
        "indexed": status.indexed,
        "is_indexing": status.is_indexing,
        "indexed_count": status.indexed_count,
        "total_count": status.total_count,
        "total_size_bytes": status.total_size_bytes,
    })))
}

/// Full-text search (Tantivy BM25)
/// Uses spawn_blocking to avoid starving the tokio runtime with synchronous I/O.
pub async fn fulltext_search(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(query): Json<SearchQuery>,
) -> AppResult<Json<SearchResponse>> {
    // Validate query is not empty
    if query.query.trim().is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "Search query must not be empty".to_string(),
        ));
    }
    // Validate query length to prevent abuse
    if query.query.len() > crate::config::MAX_SEARCH_QUERY_LENGTH {
        return Err(crate::error::AppError::BadRequest(format!(
            "Search query too long ({} chars). Maximum allowed is {}.",
            query.query.len(),
            crate::config::MAX_SEARCH_QUERY_LENGTH,
        )));
    }
    let index_manager = state.index_manager.clone();
    let response = tokio::task::spawn_blocking(move || {
        search::search_workspace(&index_manager, &workspace_id, &query)
    })
    .await
    .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("Search task failed: {}", e)))??;
    Ok(Json(response))
}

/// Grep search uses spawn_blocking to avoid starving the tokio runtime.
pub async fn grep_search(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(query): Json<GrepQuery>,
) -> AppResult<Json<GrepResponse>> {
    // Validate pattern is not empty (empty pattern matches every line in every file)
    if query.pattern.trim().is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "Grep pattern must not be empty".to_string(),
        ));
    }
    // Validate pattern length
    if query.pattern.len() > crate::config::MAX_SEARCH_QUERY_LENGTH {
        return Err(crate::error::AppError::BadRequest(format!(
            "Grep pattern too long ({} chars). Maximum allowed is {}.",
            query.pattern.len(),
            crate::config::MAX_SEARCH_QUERY_LENGTH,
        )));
    }
    let ws = state.workspace_manager.get_workspace(&workspace_id)?;
    let ws_path = ws.root_path().to_string();
    let response = tokio::task::spawn_blocking(move || {
        search::grep_workspace(&ws_path, &query)
    })
    .await
    .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("Grep task failed: {}", e)))??;
    Ok(Json(response))
}
