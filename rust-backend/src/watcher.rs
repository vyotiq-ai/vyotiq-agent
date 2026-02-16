use crate::indexer::IndexManager;
use crate::state::ServerEvent;
use dashmap::DashMap;
use notify_debouncer_full::{
    new_debouncer, DebounceEventResult, DebouncedEvent,
};
use notify::RecursiveMode;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::Mutex;
use tokio::sync::broadcast;
use tracing::{info, warn};

/// Minimum interval between re-index operations for the same file (in ms).
/// Prevents rapid saves from triggering redundant re-indexing.
/// MEMORY FIX: Increased from 2s to 5s to reduce the frequency of
/// IndexWriter allocations (each creates a new 3MB buffer).
const REINDEX_COOLDOWN_MS: u64 = 5000;

pub struct FileWatcherManager {
    watchers: DashMap<String, WatcherHandle>,
    debounce_ms: u64,
    event_tx: broadcast::Sender<ServerEvent>,
}

struct WatcherHandle {
    _watcher: notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>,
}

/// Per-file cooldown tracker to avoid redundant re-indexing
struct ReindexCooldownTracker {
    last_reindex: HashMap<String, Instant>,
}

impl ReindexCooldownTracker {
    fn new() -> Self {
        Self {
            last_reindex: HashMap::new(),
        }
    }

    /// Returns true if the file should be re-indexed (cooldown expired)
    fn should_reindex(&mut self, path: &str) -> bool {
        let now = Instant::now();
        if let Some(last) = self.last_reindex.get(path) {
            if now.duration_since(*last) < Duration::from_millis(REINDEX_COOLDOWN_MS) {
                return false;
            }
        }
        self.last_reindex.insert(path.to_string(), now);
        true
    }

    /// Periodically clean up stale entries to avoid memory growth
    fn cleanup_stale(&mut self) {
        let cutoff = Instant::now() - Duration::from_secs(60);
        self.last_reindex.retain(|_, v| *v > cutoff);
    }
}

impl FileWatcherManager {
    pub fn new(debounce_ms: u64, event_tx: broadcast::Sender<ServerEvent>) -> Self {
        Self {
            watchers: DashMap::new(),
            debounce_ms,
            event_tx,
        }
    }

    /// Start watching a workspace directory with proper debouncing and incremental re-indexing
    pub fn start_watching(
        &self,
        workspace_id: &str,
        path: &str,
        index_manager: Option<Arc<IndexManager>>,
    ) -> Result<(), notify::Error> {
        if self.watchers.contains_key(workspace_id) {
            return Ok(()); // Already watching
        }

        let ws_id = workspace_id.to_string();
        let event_tx = self.event_tx.clone();
        let ws_path = PathBuf::from(path);
        let ws_path_str = path.to_string();
        let idx_mgr = index_manager;
        let cooldown = Arc::new(Mutex::new(ReindexCooldownTracker::new()));
        let cleanup_counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));

        // Create a tokio runtime handle for async reindex calls
        let rt_handle = tokio::runtime::Handle::try_current().ok();

        // Use notify-debouncer-full for proper event deduplication
        let mut debouncer = new_debouncer(
            Duration::from_millis(self.debounce_ms),
            None, // Use default tick rate
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        // Clean up cooldown tracker periodically
                        let count = cleanup_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        if count % 50 == 0 {
                            cooldown.lock().cleanup_stale();
                        }

                        // Batch deduplicate: collect unique file paths with their final event type
                        let mut file_events: HashMap<PathBuf, String> = HashMap::new();
                        for event in &events {
                            let change_type = classify_debounced_event(event);
                            if change_type == "access" || change_type == "other" {
                                continue;
                            }

                            for path in &event.paths {
                                // Skip build/output directories
                                if IndexManager::is_build_or_output_dir(path) {
                                    continue;
                                }
                                // Last event type wins for each path
                                file_events.insert(path.clone(), change_type.to_string());
                            }
                        }

                        // Process each unique file change
                        for (path, change_type) in file_events {
                            let relative = path
                                .strip_prefix(&ws_path)
                                .unwrap_or(&path)
                                .to_string_lossy()
                                .replace('\\', "/");

                            // Check cooldown
                            if !cooldown.lock().should_reindex(&relative) {
                                continue;
                            }

                            let _ = event_tx.send(ServerEvent::FileChanged {
                                workspace_id: ws_id.clone(),
                                path: relative.clone(),
                                change_type: change_type.clone(),
                            });

                            // Trigger incremental full-text re-indexing
                            if let (Some(im), Some(handle)) = (&idx_mgr, &rt_handle) {
                                let im = im.clone();
                                let ws = ws_id.clone();
                                let fp = relative.clone();
                                let wp = ws_path_str.clone();
                                let ct = change_type.clone();
                                handle.spawn(async move {
                                    if let Err(e) = im.reindex_file(&ws, &fp, &wp, &ct).await {
                                        tracing::debug!("Incremental reindex skipped: {}", e);
                                    }
                                });
                            }
                        }
                    }
                    Err(errors) => {
                        for e in errors {
                            warn!("File watcher error: {:?}", e);
                        }
                    }
                }
            },
        )?;

        debouncer
            .watch(PathBuf::from(path).as_path(), RecursiveMode::Recursive)
            .map_err(|e| notify::Error::generic(&format!("Watch failed: {}", e)))?;

        self.watchers.insert(
            workspace_id.to_string(),
            WatcherHandle { _watcher: debouncer },
        );

        info!("Started watching workspace {} at {} (debounce: {}ms)", workspace_id, path, self.debounce_ms);
        Ok(())
    }

    pub fn stop_watching(&self, workspace_id: &str) {
        if self.watchers.remove(workspace_id).is_some() {
            info!("Stopped watching workspace {}", workspace_id);
        }
    }

    pub fn is_watching(&self, workspace_id: &str) -> bool {
        self.watchers.contains_key(workspace_id)
    }
}

/// Classify a debounced event into a simple change type
fn classify_debounced_event(event: &DebouncedEvent) -> &'static str {
    use notify::EventKind;
    match event.kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        EventKind::Access(_) => "access",
        _ => "other",
    }
}
