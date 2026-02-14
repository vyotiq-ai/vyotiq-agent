use crate::error::{AppError, AppResult};
use crate::state::ServerEvent;
use dashmap::DashMap;
use ignore::WalkBuilder;
use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tantivy::schema::*;
use tantivy::{Index, IndexReader, IndexWriter, TantivyDocument};
use tokio::sync::broadcast;
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub struct IndexSchema {
    pub path: Field,
    pub relative_path: Field,
    pub filename: Field,
    pub extension: Field,
    pub content: Field,
    pub language: Field,
    pub size: Field,
    pub modified: Field,
    pub content_hash: Field,
    pub symbols: Field,
    schema: Schema,
}

impl IndexSchema {
    pub fn build() -> Self {
        let mut builder = Schema::builder();

        let path = builder.add_text_field("path", STRING | STORED);
        let relative_path = builder.add_text_field("relative_path", STRING | STORED);
        let filename = builder.add_text_field("filename", TEXT | STORED);
        let extension = builder.add_text_field("extension", STRING | STORED);
        let content = builder.add_text_field("content", TEXT | STORED);
        let language = builder.add_text_field("language", STRING | STORED);
        let size = builder.add_u64_field("size", INDEXED | STORED);
        let modified = builder.add_u64_field("modified", INDEXED | STORED);
        let content_hash = builder.add_text_field("content_hash", STRING | STORED);
        let symbols = builder.add_text_field("symbols", TEXT | STORED);

        let schema = builder.build();

        Self {
            path,
            relative_path,
            filename,
            extension,
            content,
            language,
            size,
            modified,
            content_hash,
            symbols,
            schema,
        }
    }

    pub fn schema(&self) -> &Schema {
        &self.schema
    }
}

/// Tracks indexing state for a workspace
pub struct IndexState {
    pub index: Index,
    pub reader: IndexReader,
    pub schema: IndexSchema,
    pub is_indexing: AtomicBool,
    pub indexed_count: AtomicUsize,
    pub total_count: AtomicUsize,
    pub total_size_bytes: std::sync::atomic::AtomicU64,
}

pub struct IndexManager {
    indexes: DashMap<String, Arc<IndexState>>,
    base_dir: PathBuf,
    max_file_size: usize,
    batch_size: usize,
    /// Serializes all Tantivy IndexWriter operations.
    /// Tantivy only allows one writer at a time per index; concurrent
    /// `reindex_file` calls from the file watcher would otherwise contend.
    writer_lock: tokio::sync::Mutex<()>,
    /// Per-workspace content hashes stored as a sidecar file.
    /// Much faster than scanning the entire Tantivy index via AllQuery.
    content_hashes: DashMap<String, HashMap<String, String>>,
    /// Tracks whether a workspace has completed at least one full indexing pass.
    /// Prevents false `indexed: true` for workspaces that only loaded an index from disk
    /// but haven't verified its completeness.
    indexed_workspaces: DashMap<String, bool>,
}

impl IndexManager {
    pub fn new(base_dir: PathBuf, max_file_size: usize, batch_size: usize) -> Self {
        Self {
            indexes: DashMap::new(),
            base_dir,
            max_file_size,
            batch_size,
            writer_lock: tokio::sync::Mutex::new(()),
            content_hashes: DashMap::new(),
            indexed_workspaces: DashMap::new(),
        }
    }

    fn index_dir(&self, workspace_id: &str) -> PathBuf {
        self.base_dir.join(workspace_id)
    }

    pub fn get_or_create_index(&self, workspace_id: &str) -> AppResult<Arc<IndexState>> {
        if let Some(state) = self.indexes.get(workspace_id) {
            return Ok(state.value().clone());
        }

        let schema_def = IndexSchema::build();
        let index_path = self.index_dir(workspace_id);
        std::fs::create_dir_all(&index_path)?;

        let index = if index_path.join("meta.json").exists() {
            Index::open_in_dir(&index_path)
                .map_err(|e| AppError::IndexError(format!("Failed to open index: {}", e)))?
        } else {
            Index::create_in_dir(&index_path, schema_def.schema().clone())
                .map_err(|e| AppError::IndexError(format!("Failed to create index: {}", e)))?
        };

        let reader = index
            .reader()
            .map_err(|e| AppError::IndexError(format!("Failed to create reader: {}", e)))?;

        let state = Arc::new(IndexState {
            index,
            reader,
            schema: schema_def,
            is_indexing: AtomicBool::new(false),
            indexed_count: AtomicUsize::new(0),
            total_count: AtomicUsize::new(0),
            total_size_bytes: std::sync::atomic::AtomicU64::new(0),
        });

        self.indexes.insert(workspace_id.to_string(), state.clone());
        Ok(state)
    }

    /// Index an entire workspace with smart incremental deduplication.
    /// Compares content hashes to skip re-indexing unchanged files.
    pub async fn index_workspace(
        &self,
        workspace_id: &str,
        workspace_path: &str,
        event_tx: broadcast::Sender<ServerEvent>,
    ) -> AppResult<()> {
        let index_state = self.get_or_create_index(workspace_id)?;

        // Atomically check and set is_indexing to prevent concurrent indexing.
        if index_state
            .is_indexing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            info!("Indexing already in progress for workspace {}, skipping", workspace_id);
            return Ok(());
        }

        let ws_id = workspace_id.to_string();
        let ws_path = workspace_path.to_string();
        let max_file_size = self.max_file_size;
        let batch_size = self.batch_size;
        let state = index_state.clone();

        let start = std::time::Instant::now();

        // Collect files to index
        let files: Vec<PathBuf> = WalkBuilder::new(&ws_path)
            .hidden(false)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .max_depth(Some(20))
            .build()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_some_and(|ft| ft.is_file()))
            .filter(|entry| !Self::is_build_or_output_dir(entry.path()))
            .filter(|entry| {
                entry
                    .metadata()
                    .map(|m| m.len() <= max_file_size as u64)
                    .unwrap_or(false)
            })
            .filter(|entry| Self::is_indexable(entry.path()))
            .map(|entry| entry.into_path())
            .collect();

        state.total_count.store(files.len(), Ordering::Relaxed);
        let total = files.len();

        // Compute total size of all files for stats
        let total_size: u64 = files
            .iter()
            .filter_map(|f| f.metadata().ok())
            .map(|m| m.len())
            .sum();
        state
            .total_size_bytes
            .store(total_size, Ordering::Relaxed);

        // Read existing content hashes from the sidecar file for deduplication
        let existing_hashes = self.read_existing_hashes(&ws_id)?;

        // Compute hashes for all current files in parallel
        let new_file_hashes: Vec<(PathBuf, String)> = files
            .par_iter()
            .filter_map(|file_path| {
                let content = std::fs::read_to_string(file_path).ok()?;
                let mut hasher = Sha256::new();
                hasher.update(content.as_bytes());
                let hash = format!("{:x}", hasher.finalize());
                Some((file_path.clone(), hash))
            })
            .collect();

        // Determine which files need re-indexing
        let new_file_set: std::collections::HashSet<String> = new_file_hashes
            .iter()
            .map(|(p, _)| p.to_string_lossy().to_string())
            .collect();

        let mut files_to_index: Vec<PathBuf> = Vec::new();
        let mut unchanged_count = 0usize;

        for (file_path, new_hash) in &new_file_hashes {
            let path_key = file_path.to_string_lossy().to_string();
            match existing_hashes.get(&path_key) {
                Some(existing_hash) if existing_hash == new_hash => {
                    unchanged_count += 1;
                }
                _ => {
                    files_to_index.push(file_path.clone());
                }
            }
        }

        // Find paths to remove (files deleted since last index)
        let paths_to_remove: Vec<String> = existing_hashes
            .keys()
            .filter(|p| !new_file_set.contains(*p))
            .cloned()
            .collect();

        info!(
            "Smart indexing workspace {}: {} unchanged (skipped), {} to index, {} to remove, total {} files ({:.1} MB)",
            ws_id, unchanged_count, files_to_index.len(), paths_to_remove.len(), total, total_size as f64 / 1_048_576.0
        );

        // If nothing changed, skip the expensive write
        if files_to_index.is_empty() && paths_to_remove.is_empty() {
            state.indexed_count.store(total, Ordering::Relaxed);
            state.is_indexing.store(false, Ordering::Release);
            // Still mark workspace as indexed — it completed successfully with zero changes
            self.indexed_workspaces.insert(ws_id.clone(), true);
            let duration = start.elapsed();

            // Do NOT broadcast IndexingStarted/IndexingCompleted for no-op runs.
            // The frontend only needs to know when there's actual work.
            info!(
                "Index up-to-date for {}: {} files, all unchanged ({}ms)",
                ws_id, total, duration.as_millis()
            );
            return Ok(());
        }

        // There IS work to do — broadcast start and reset counters now
        state.indexed_count.store(0, Ordering::Relaxed);
        let _ = event_tx.send(ServerEvent::IndexingStarted {
            workspace_id: ws_id.clone(),
        });

        // Create writer with 50MB buffer
        let mut writer: IndexWriter = state
            .index
            .writer(50_000_000)
            .map_err(|e| AppError::IndexError(format!("Failed to create writer: {}", e)))?;

        // Remove documents for changed/deleted files (not all documents)
        for path_to_remove in &paths_to_remove {
            let path_term = tantivy::Term::from_field_text(state.schema.path, path_to_remove);
            writer.delete_term(path_term);
        }
        for file_path in &files_to_index {
            let path_term = tantivy::Term::from_field_text(
                state.schema.path,
                &file_path.to_string_lossy(),
            );
            writer.delete_term(path_term);
        }

        let ws_path_buf = PathBuf::from(&ws_path);

        // Parallel file reading: read only the changed/new files
        let schema = state.schema.clone();
        let file_data: Vec<_> = files_to_index
            .par_iter()
            .filter_map(|file_path| {
                match Self::prepare_file_document(&schema, file_path, &ws_path_buf) {
                    Ok(doc) => Some(doc),
                    Err(e) => {
                        tracing::debug!("Skipped {}: {}", file_path.display(), e);
                        None
                    }
                }
            })
            .collect();

        // Sequential write to Tantivy (writer is single-threaded)
        for doc in file_data {
            if let Err(e) = writer.add_document(doc) {
                warn!("Failed to add document: {}", e);
            }
            state.indexed_count.fetch_add(1, Ordering::Relaxed);

            // Emit progress every batch_size files
            let indexed = state.indexed_count.load(Ordering::Relaxed);
            if indexed % batch_size == 0 {
                let _ = event_tx.send(ServerEvent::IndexingProgress {
                    workspace_id: ws_id.clone(),
                    indexed,
                    total: files_to_index.len(),
                });
            }
        }

        // Commit
        writer.commit().map_err(|e| {
            AppError::IndexError(format!("Failed to commit index: {}", e))
        })?;

        state.reader.reload().map_err(|e| {
            AppError::IndexError(format!("Failed to reload reader: {}", e))
        })?;

        // Update content hashes sidecar: merge new hashes, remove deleted paths
        {
            let mut updated_hashes = existing_hashes;
            for path_to_remove in &paths_to_remove {
                updated_hashes.remove(path_to_remove);
            }
            for (file_path, new_hash) in &new_file_hashes {
                updated_hashes.insert(file_path.to_string_lossy().to_string(), new_hash.clone());
            }
            self.content_hashes.insert(ws_id.clone(), updated_hashes);
            if let Err(e) = self.save_content_hashes(&ws_id) {
                warn!("Failed to save content hashes sidecar for {}: {}", ws_id, e);
            }
        }

        let duration = start.elapsed();
        state.indexed_count.store(total, Ordering::Relaxed);
        state.is_indexing.store(false, Ordering::Release);
        // Mark workspace as having completed indexing
        self.indexed_workspaces.insert(ws_id.clone(), true);

        let _ = event_tx.send(ServerEvent::IndexingCompleted {
            workspace_id: ws_id.clone(),
            total_files: total,
            duration_ms: duration.as_millis() as u64,
        });

        info!(
            "Indexing complete for {}: {} new/changed files indexed, {} unchanged skipped, {} removed, in {}ms",
            ws_id,
            files_to_index.len(),
            unchanged_count,
            paths_to_remove.len(),
            duration.as_millis()
        );

        Ok(())
    }

    /// Read existing content hashes from the sidecar file for deduplication.
    /// Uses a fast JSON sidecar file (`content_hashes.json`) instead of scanning
    /// the entire Tantivy index via AllQuery, which is O(n) over all documents.
    /// Returns a map of absolute file path -> content hash.
    fn read_existing_hashes(&self, workspace_id: &str) -> AppResult<HashMap<String, String>> {
        // Check in-memory cache first
        if let Some(hashes) = self.content_hashes.get(workspace_id) {
            return Ok(hashes.value().clone());
        }

        // Try loading from sidecar file
        let hash_path = self.index_dir(workspace_id).join("content_hashes.json");
        let hashes = if hash_path.exists() {
            match std::fs::read_to_string(&hash_path) {
                Ok(json) => serde_json::from_str::<HashMap<String, String>>(&json)
                    .unwrap_or_default(),
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        self.content_hashes.insert(workspace_id.to_string(), hashes.clone());
        Ok(hashes)
    }

    /// Save content hashes to the sidecar file for persistence across restarts.
    fn save_content_hashes(&self, workspace_id: &str) -> AppResult<()> {
        if let Some(hashes) = self.content_hashes.get(workspace_id) {
            let hash_path = self.index_dir(workspace_id).join("content_hashes.json");
            let json = serde_json::to_string(hashes.value())
                .map_err(|e| AppError::IndexError(format!("Failed to serialize content hashes: {}", e)))?;
            // Atomic write: write to tmp file then rename
            let tmp_path = hash_path.with_extension("json.tmp");
            std::fs::write(&tmp_path, &json)?;
            std::fs::rename(&tmp_path, &hash_path)?;
        }
        Ok(())
    }

    fn index_file(
        schema: &IndexSchema,
        writer: &mut IndexWriter,
        file_path: &Path,
        workspace_path: &Path,
    ) -> AppResult<()> {
        let doc = Self::prepare_file_document(schema, file_path, workspace_path)?;
        writer.add_document(doc).map_err(|e| {
            AppError::IndexError(format!("Failed to add document: {}", e))
        })?;
        Ok(())
    }

    /// Prepare a TantivyDocument from a file without writing it.
    /// This is safe to call from rayon's parallel iterator (no &mut writer needed).
    fn prepare_file_document(
        schema: &IndexSchema,
        file_path: &Path,
        workspace_path: &Path,
    ) -> AppResult<TantivyDocument> {
        let content = std::fs::read_to_string(file_path).map_err(|_| {
            AppError::FileNotFound(file_path.to_string_lossy().to_string())
        })?;

        let relative = file_path
            .strip_prefix(workspace_path)
            .unwrap_or(file_path)
            .to_string_lossy()
            .replace('\\', "/");

        let filename = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let extension = file_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let language = crate::lang::detect_language(&extension).to_string();

        let metadata = std::fs::metadata(file_path)?;
        let size = metadata.len();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        let mut doc = TantivyDocument::new();
        doc.add_text(schema.path, &file_path.to_string_lossy());
        doc.add_text(schema.relative_path, &relative);
        doc.add_text(schema.filename, &filename);
        doc.add_text(schema.extension, &extension);
        doc.add_text(schema.content, &content);
        doc.add_text(schema.language, &language);
        doc.add_u64(schema.size, size);
        doc.add_u64(schema.modified, modified);
        doc.add_text(schema.content_hash, &hash);
        doc.add_text(schema.symbols, &extract_symbols(&content, &language));

        Ok(doc)
    }

    fn is_indexable(path: &Path) -> bool {
        let ext = path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();

        crate::config::is_supported_extension(&ext)
        || path.file_name().is_some_and(|n| {
            let name = n.to_string_lossy().to_lowercase();
            matches!(
                name.as_str(),
                "dockerfile" | "makefile" | "cmakelists.txt" | "cargo.toml"
                    | "package.json" | "tsconfig.json" | "pyproject.toml"
                    | ".gitignore" | ".eslintrc" | ".prettierrc"
                    | "readme" | "license" | "changelog" | "contributing"
            )
        })
    }

    /// Skip files inside build/output directories that should never be indexed.
    /// This catches common build artifacts even when .gitignore is absent.
    /// Public so that grep search can also reuse this filter.
    pub fn is_build_or_output_dir(path: &Path) -> bool {
        for component in path.components() {
            if let std::path::Component::Normal(name) = component {
                let name_str = name.to_string_lossy();
                let n = name_str.as_ref();

                // Exact name matches
                if matches!(
                    n,
                    "node_modules"
                        | ".git"
                        | "target"
                        | "dist"
                        | "build"
                        | "out"
                        | ".next"
                        | ".nuxt"
                        | ".output"
                        | ".vite"
                        | ".turbo"
                        | ".svelte-kit"
                        | ".parcel-cache"
                        | "__pycache__"
                        | ".tox"
                        | ".mypy_cache"
                        | ".pytest_cache"
                        | ".ruff_cache"
                        | "coverage"
                        | ".nyc_output"
                        | ".cache"
                        | "vendor"
                        | ".gradle"
                        | ".maven"
                        | ".terraform"
                        | ".eggs"
                        | ".vscode"
                        | ".idea"
                        | ".angular"
                        | ".expo"
                        | ".vercel"
                        | ".netlify"
                        | ".serverless"
                        | ".aws-sam"
                        | "__generated__"
                        | ".cargo"
                ) {
                    return true;
                }

                // Suffix-based patterns (e.g., *.egg-info)
                if n.ends_with(".egg-info") {
                    return true;
                }
            }
        }
        false
    }

    // Language detection consolidated into crate::lang::detect_language()

    pub fn get_index_status(&self, workspace_id: &str) -> AppResult<IndexStatusResponse> {
        // Auto-load index from disk if not yet in memory.
        // This prevents false `indexed: false` returns when the index exists
        // on disk but hasn't been loaded yet (e.g., before activate_workspace).
        if !self.indexes.contains_key(workspace_id) {
            // Check if the index directory exists on disk before trying to load
            let index_dir = self.index_dir(workspace_id);
            if index_dir.join("meta.json").exists() {
                // Attempt to load — ignore errors (will return indexed: false)
                let _ = self.get_or_create_index(workspace_id);
            }
        }

        if let Some(state) = self.indexes.get(workspace_id) {
            // Use explicit indexed_workspaces tracking:
            // A workspace is "indexed" only after completing at least one full indexing pass.
            // Loading an index from disk alone doesn't count — the hashes file may be stale
            // or the index may be from a previous session with different files.
            let has_completed_indexing = self.indexed_workspaces
                .get(workspace_id)
                .map(|v| *v.value())
                .unwrap_or(false);
            // Also consider it indexed if the sidecar hash file exists (persisted across restarts)
            let has_persisted_hashes = !has_completed_indexing
                && self.index_dir(workspace_id).join("content_hashes.json").exists();
            let is_indexed = has_completed_indexing || has_persisted_hashes;
            
            if has_persisted_hashes {
                self.indexed_workspaces.insert(workspace_id.to_string(), true);
            }

            Ok(IndexStatusResponse {
                indexed: is_indexed,
                is_indexing: state.is_indexing.load(Ordering::Acquire),
                indexed_count: state.indexed_count.load(Ordering::Relaxed),
                total_count: state.total_count.load(Ordering::Relaxed),
                total_size_bytes: state.total_size_bytes.load(Ordering::Relaxed),
            })
        } else {
            Ok(IndexStatusResponse {
                indexed: false,
                is_indexing: false,
                indexed_count: 0,
                total_count: 0,
                total_size_bytes: 0,
            })
        }
    }

    /// Incrementally re-index a single file (used by file watcher).
    /// Acquires `writer_lock` to serialize Tantivy writer access across
    /// concurrent file-change events.
    pub async fn reindex_file(
        &self,
        workspace_id: &str,
        file_path: &str,
        workspace_path: &str,
        change_type: &str,
    ) -> AppResult<()> {
        let index_state = match self.indexes.get(workspace_id) {
            Some(state) => state.value().clone(),
            None => return Ok(()), // No index yet, skip
        };

        // Serialize writer access — Tantivy allows only one IndexWriter at a time
        let _guard = self.writer_lock.lock().await;

        // Skip if a full indexing is in progress
        if index_state.is_indexing.load(Ordering::Acquire) {
            return Ok(());
        }

        let abs_path = PathBuf::from(workspace_path).join(file_path);
        let ws_path_buf = PathBuf::from(workspace_path);

        let mut writer: IndexWriter = index_state
            .index
            .writer(10_000_000) // 10MB buffer for single-file operations
            .map_err(|e| AppError::IndexError(format!("Failed to create writer: {}", e)))?;

        // Delete existing document for this file path
        let path_term = tantivy::Term::from_field_text(
            index_state.schema.path,
            &abs_path.to_string_lossy(),
        );
        writer.delete_term(path_term);

        // For create/modify, re-index the file
        if change_type != "remove" {
            if abs_path.exists() && Self::is_indexable(&abs_path) {
                let metadata = std::fs::metadata(&abs_path).ok();
                let file_size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

                if file_size <= self.max_file_size as u64 {
                    if let Err(e) = Self::index_file(
                        &index_state.schema,
                        &mut writer,
                        &abs_path,
                        &ws_path_buf,
                    ) {
                        warn!("Failed to re-index {}: {}", file_path, e);
                    }
                }
            }
        }

        writer.commit().map_err(|e| {
            AppError::IndexError(format!("Failed to commit incremental index: {}", e))
        })?;

        index_state.reader.reload().map_err(|e| {
            AppError::IndexError(format!("Failed to reload reader: {}", e))
        })?;

        info!("Incrementally re-indexed file: {} ({})", file_path, change_type);
        Ok(())
    }

    pub fn remove_index(&self, workspace_id: &str) -> AppResult<()> {
        self.indexes.remove(workspace_id);
        self.content_hashes.remove(workspace_id);
        self.indexed_workspaces.remove(workspace_id);
        let index_dir = self.index_dir(workspace_id);
        if index_dir.exists() {
            std::fs::remove_dir_all(&index_dir)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct IndexStatusResponse {
    pub indexed: bool,
    pub is_indexing: bool,
    pub indexed_count: usize,
    pub total_count: usize,
    pub total_size_bytes: u64,
}

// =============================================================================
// Regex-based Symbol Extraction
// =============================================================================

/// Extract top-level symbol names from source code using regex patterns.
/// Returns a space-separated string of symbol names for full-text indexing.
/// Covers functions, classes, structs, interfaces, enums, types, traits, and impls
/// across all supported languages.
fn extract_symbols(content: &str, language: &str) -> String {
    use regex::Regex;
    use std::sync::LazyLock;

    // Pre-compiled regexes for each language family (thread-safe singletons)
    static RE_TS_JS: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)^(?:export\s+)?(?:async\s+)?function\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:export\s+)?class\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:export\s+)?interface\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:export\s+)?type\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:export\s+)?enum\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:export\s+)?const\s+(\w+)\s*[:=]").unwrap(),
    ]);

    static RE_RUST: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)^(?:pub(?:\([\w:]+\))?\s+)?(?:async\s+)?fn\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:pub(?:\([\w:]+\))?\s+)?struct\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:pub(?:\([\w:]+\))?\s+)?enum\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:pub(?:\([\w:]+\))?\s+)?trait\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^(?:pub(?:\([\w:]+\))?\s+)?type\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^impl(?:<[^>]*>)?\s+(\w+)").unwrap(),
    ]);

    static RE_PYTHON: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)^(?:async\s+)?def\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^class\s+(\w+)").unwrap(),
    ]);

    static RE_GO: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)^func\s+(?:\([^)]+\)\s+)?(\w+)").unwrap(),
        Regex::new(r"(?m)^type\s+(\w+)\s+(?:struct|interface)").unwrap(),
    ]);

    static RE_JAVA: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?class\s+(\w+)").unwrap(),
        Regex::new(r"(?m)(?:public|private|protected)?\s*interface\s+(\w+)").unwrap(),
        Regex::new(r"(?m)(?:public|private|protected)?\s*enum\s+(\w+)").unwrap(),
        Regex::new(r"(?m)(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:synchronized\s+)?[\w<>\[\]]+\s+(\w+)\s*\(").unwrap(),
    ]);

    static RE_C_CPP: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)^(?:static\s+)?(?:inline\s+)?(?:virtual\s+)?(?:[\w:*&<>]+\s+)+(\w+)\s*\(").unwrap(),
        Regex::new(r"(?m)^(?:class|struct)\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^enum\s+(?:class\s+)?(\w+)").unwrap(),
        Regex::new(r"(?m)^namespace\s+(\w+)").unwrap(),
    ]);

    static RE_RUBY: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)^\s*def\s+(?:self\.)?(\w+[?!]?)").unwrap(),
        Regex::new(r"(?m)^\s*class\s+(\w+)").unwrap(),
        Regex::new(r"(?m)^\s*module\s+(\w+)").unwrap(),
    ]);

    static RE_PHP: LazyLock<Vec<Regex>> = LazyLock::new(|| vec![
        Regex::new(r"(?m)(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)").unwrap(),
        Regex::new(r"(?m)(?:abstract\s+)?class\s+(\w+)").unwrap(),
        Regex::new(r"(?m)interface\s+(\w+)").unwrap(),
        Regex::new(r"(?m)trait\s+(\w+)").unwrap(),
    ]);

    let regexes: &[Regex] = match language {
        "typescript" | "javascript" => &RE_TS_JS,
        "rust" => &RE_RUST,
        "python" => &RE_PYTHON,
        "go" => &RE_GO,
        "java" | "kotlin" | "scala" => &RE_JAVA,
        "c" | "cpp" | "csharp" => &RE_C_CPP,
        "ruby" => &RE_RUBY,
        "php" => &RE_PHP,
        _ => return String::new(),
    };

    let mut symbols = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for re in regexes {
        for cap in re.captures_iter(content) {
            if let Some(name) = cap.get(1) {
                let sym = name.as_str();
                // Skip very short or common keywords
                if sym.len() >= 2 && seen.insert(sym.to_string()) {
                    symbols.push(sym.to_string());
                }
            }
        }
    }

    symbols.join(" ")
}
