use axum::Json;
use serde_json::{json, Value};
use std::time::Instant;
use std::sync::OnceLock;
use tokio::sync::Notify;
use std::sync::Arc;

static START_TIME: OnceLock<Instant> = OnceLock::new();
static SHUTDOWN_NOTIFY: OnceLock<Arc<Notify>> = OnceLock::new();

/// Initialize the start time (call once at startup)
pub fn init_start_time() {
    START_TIME.get_or_init(Instant::now);
}

/// Initialize the shutdown notifier
pub fn init_shutdown_notify() -> Arc<Notify> {
    SHUTDOWN_NOTIFY.get_or_init(|| Arc::new(Notify::new())).clone()
}

/// Get a future that resolves when shutdown is requested
pub async fn wait_for_shutdown() {
    if let Some(notify) = SHUTDOWN_NOTIFY.get() {
        notify.notified().await;
    } else {
        std::future::pending::<()>().await;
    }
}

pub async fn health_check() -> Json<Value> {
    let uptime = START_TIME
        .get()
        .map(|s| s.elapsed().as_secs())
        .unwrap_or(0);

    Json(json!({
        "status": "ok",
        "service": "vyotiq-backend",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime": uptime,
    }))
}

/// Graceful shutdown endpoint for Windows compatibility
pub async fn shutdown_handler() -> Json<Value> {
    tracing::info!("Shutdown requested via HTTP endpoint");
    if let Some(notify) = SHUTDOWN_NOTIFY.get() {
        notify.notify_one();
    }
    Json(json!({
        "status": "shutting_down",
    }))
}
