use anyhow::Result;
use std::net::SocketAddr;
use tracing::{info, error};
use tracing_subscriber::prelude::*;

mod config;
mod error;
mod indexer;
pub mod lang;
mod routes;
mod search;
mod server;
mod state;
mod watcher;
mod workspace;

#[tokio::main]
async fn main() -> Result<()> {
    // Resolve log directory (same parent as data_dir or from env)
    let log_dir = std::env::var("VYOTIQ_LOG_DIR").unwrap_or_else(|_| {
        dirs::data_local_dir()
            .map(|d| d.join("vyotiq-backend").join("logs").to_string_lossy().to_string())
            .unwrap_or_else(|| ".vyotiq-data/logs".to_string())
    });
    std::fs::create_dir_all(&log_dir).ok();

    // File appender: daily rotated log files
    let file_appender = tracing_appender::rolling::daily(&log_dir, "vyotiq-backend.log");
    let (non_blocking_writer, _guard) = tracing_appender::non_blocking(file_appender);

    // Build tracing subscriber with both stdout + file output using layers
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "vyotiq_backend=info,tower_http=info".into());

    // Stdout layer (captured by Electron sidecar)
    let stdout_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .compact();

    // File layer (daily rotated, non-blocking)
    let file_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .with_ansi(false)
        .with_writer(non_blocking_writer)
        .compact();

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer)
        .with(file_layer)
        .init();

    // Install panic hook that logs before aborting
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic payload".to_string()
        };
        error!(target: "vyotiq_backend::panic", location = %location, payload = %payload, "PANIC: thread panicked");
        default_panic(info);
    }));

    // Initialize health check uptime counter
    routes::health::init_start_time();

    let config = config::AppConfig::from_env();
    let addr: SocketAddr = config.listen_addr.parse()?;

    info!(
        listen_addr = %config.listen_addr,
        data_dir = %config.data_dir,
        max_index_size_mb = config.max_index_size_mb,
        max_file_size_bytes = config.max_file_size_bytes,
        watcher_debounce_ms = config.watcher_debounce_ms,
        index_batch_size = config.index_batch_size,
        log_dir = %log_dir,
        "Vyotiq backend starting"
    );

    let app_state = state::AppState::new(config).await?;

    // Restore file watchers for all persisted workspaces on startup.
    // This ensures real-time indexing continues across restarts.
    {
        let workspaces = app_state.workspace_manager.list_workspaces();
        for ws in &workspaces {
            if let Err(e) = app_state.watcher_manager.start_watching(
                &ws.id,
                &ws.path,
                Some(app_state.index_manager.clone()),
            ) {
                tracing::warn!("Failed to restore watcher for workspace {} ({}): {}", ws.name, ws.id, e);
            } else {
                tracing::info!("Restored file watcher for workspace {} ({})", ws.name, ws.id);
            }
        }
        if !workspaces.is_empty() {
            info!("Restored {} workspace watcher(s)", workspaces.len());
        }
    }

    // Initialize the shutdown notify channel for graceful HTTP-based shutdown
    routes::health::init_shutdown_notify();

    let app_state_shutdown = app_state.clone();
    let app = server::create_app(app_state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("Vyotiq backend listening on {}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Vyotiq backend shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    // On Windows, ctrl_c is the primary shutdown signal since SIGTERM is not available.
    // We also listen for the HTTP /shutdown endpoint for graceful shutdown from the Electron sidecar.
    #[cfg(not(unix))]
    let terminate = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install secondary Ctrl+C handler");
    };

    // Also wait for HTTP-based shutdown request (cross-platform, primarily for Windows)
    let http_shutdown = routes::health::wait_for_shutdown();

    tokio::select! {
        _ = ctrl_c => { info!("Received Ctrl+C, initiating shutdown"); },
        _ = terminate => { info!("Received terminate signal, initiating shutdown"); },
        _ = http_shutdown => { info!("Received HTTP shutdown request, initiating shutdown"); },
    }

    info!("Shutdown signal received");
}
