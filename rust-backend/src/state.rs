use crate::config::AppConfig;
use crate::embedder::EmbeddingManager;
use crate::error::AppResult;
use crate::indexer::IndexManager;
use crate::watcher::FileWatcherManager;
use crate::workspace::WorkspaceManager;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Events broadcast to all connected WebSocket clients
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ServerEvent {
    #[serde(rename = "workspace_created")]
    WorkspaceCreated { workspace_id: String, path: String },
    #[serde(rename = "workspace_removed")]
    WorkspaceRemoved { workspace_id: String },
    #[serde(rename = "index_started")]
    IndexingStarted { workspace_id: String },
    #[serde(rename = "index_progress")]
    IndexingProgress { workspace_id: String, indexed: usize, total: usize },
    #[serde(rename = "index_complete")]
    IndexingCompleted { workspace_id: String, total_files: usize, duration_ms: u64 },
    #[serde(rename = "index_error")]
    IndexingError { workspace_id: String, error: String },
    #[serde(rename = "vector_index_progress")]
    VectorIndexingProgress { workspace_id: String, embedded_chunks: usize, total_chunks: usize },
    #[serde(rename = "vector_index_complete")]
    VectorIndexingCompleted { workspace_id: String, total_chunks: usize, duration_ms: u64 },
    #[serde(rename = "file_changed")]
    FileChanged { workspace_id: String, path: String, change_type: String },
    #[serde(rename = "search_ready")]
    SearchReady { workspace_id: String },
}

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub workspace_manager: Arc<WorkspaceManager>,
    pub index_manager: Arc<IndexManager>,
    pub embedding_manager: Arc<EmbeddingManager>,
    pub watcher_manager: Arc<FileWatcherManager>,
    pub event_tx: broadcast::Sender<ServerEvent>,
}

impl AppState {
    pub async fn new(config: AppConfig) -> AppResult<Self> {
        let (event_tx, _) = broadcast::channel(1024);

        let data_dir = std::path::PathBuf::from(&config.data_dir);
        tokio::fs::create_dir_all(&data_dir).await.map_err(|e| {
            crate::error::AppError::Io(e)
        })?;

        let workspace_manager = Arc::new(WorkspaceManager::new(data_dir.clone()));
        let index_manager = Arc::new(IndexManager::new(
            data_dir.join("indexes"),
            config.max_file_size_bytes,
            config.index_batch_size,
        ));
        let embedding_manager = Arc::new(EmbeddingManager::new(data_dir.clone()));
        let watcher_manager = Arc::new(FileWatcherManager::new(
            config.watcher_debounce_ms,
            event_tx.clone(),
        ));

        Ok(Self {
            config,
            workspace_manager,
            index_manager,
            embedding_manager,
            watcher_manager,
            event_tx,
        })
    }
}
