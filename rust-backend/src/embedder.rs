//! Embedding & Vector Search Module
//!
//! Provides local, on-device code embedding using Qwen3-Embedding-0.6B
//! (decoder-only LLM embedder, June 2025 SOTA) via fastembed's candle backend
//! and HNSW vector indexing via usearch for true semantic search.
//!
//! Architecture:
//! - `EmbeddingManager`: Singleton wrapper around `Qwen3TextEmbedding` (candle)
//! - `WorkspaceVectorState`: Per-workspace HNSW index stored on disk
//! - Chunking → batched embedding → usearch HNSW → cosine similarity

use candle_core::{DType, Device};
use fastembed::Qwen3TextEmbedding;
use parking_lot::RwLock;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};
use usearch::ffi::{IndexOptions, MetricKind, ScalarKind};

use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Embedding dimension for Qwen3-Embedding-0.6B.
/// The model's `config.hidden_size` = 1024 dimensions.
/// Decoder-only LLM embedder with last-token pooling, #1 on MTEB (June 2025).
/// 32K context, 100+ languages, Apache-2.0, instruction-aware.
const EMBEDDING_DIM: usize = 1024;

/// HuggingFace model repository for Qwen3-Embedding-0.6B.
const QWEN3_REPO_ID: &str = "Qwen/Qwen3-Embedding-0.6B";

/// Maximum token length for the embedding model truncation.
/// Qwen3 supports up to 32768, but we use 8192 for code embedding
/// to balance quality and memory usage on CPU.
const QWEN3_MAX_LENGTH: usize = 8192;

/// Maximum number of characters per chunk for embedding.
/// Tuned for code: ~1024 chars fits well within the token budget while
/// maintaining sufficient granularity for code search.
const MAX_CHUNK_CHARS: usize = 1024;

/// Overlap between chunks in characters.
/// Proportionally sized for continuity between adjacent chunks.
const CHUNK_OVERLAP_CHARS: usize = 96;

/// Maximum chunks per file to avoid blowing up memory on huge files
const MAX_CHUNKS_PER_FILE: usize = 200;

/// Batch size for embedding inference.
/// Qwen3 candle backend processes batches internally via encode_batch.
/// Decoder-only models are heavier per-token than encoder-only, so use smaller batches.
const EMBED_BATCH_SIZE: usize = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResult {
    pub path: String,
    pub relative_path: String,
    pub chunk_text: String,
    pub score: f32,
    pub line_start: usize,
    pub line_end: usize,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResponse {
    pub results: Vec<SemanticSearchResult>,
    pub query_time_ms: u64,
}

/// Metadata stored alongside each vector key
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChunkMeta {
    relative_path: String,
    abs_path: String,
    chunk_text: String,
    line_start: usize,
    line_end: usize,
    language: String,
}

/// Tracks content hashes per file for deduplication
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ContentHashMap {
    hashes: HashMap<String, String>, // abs_path -> sha256 hex
}

// ---------------------------------------------------------------------------
// Per-workspace vector index
// ---------------------------------------------------------------------------

struct WorkspaceVectorState {
    index: usearch::Index,
    metadata: HashMap<u64, ChunkMeta>,
    next_key: u64,
    index_path: PathBuf,
    meta_path: PathBuf,
    content_hashes: ContentHashMap,
    hash_path: PathBuf,
    /// Dirty flag: set when data changes, cleared when saved to disk
    dirty: bool,
    /// Timestamp of last disk save for throttling incremental saves
    last_save: std::time::Instant,
}

// ---------------------------------------------------------------------------
// EmbeddingManager
// ---------------------------------------------------------------------------

pub struct EmbeddingManager {
    /// Qwen3-Embedding-0.6B loaded via candle backend.
    /// Wrapped in Mutex because `embed()` takes `&self` but tokenizer is not Sync.
    model: Arc<Mutex<Option<Qwen3TextEmbedding>>>,
    workspaces: dashmap::DashMap<String, Arc<RwLock<WorkspaceVectorState>>>,
    base_dir: PathBuf,
    model_initialized: Arc<std::sync::atomic::AtomicBool>,
    /// Per-workspace atomic guards to prevent concurrent full vector index rebuilds.
    /// Using a DashMap allows multiple workspaces to be indexed independently.
    indexing_workspaces: dashmap::DashMap<String, Arc<std::sync::atomic::AtomicBool>>,
}

impl EmbeddingManager {
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            model: Arc::new(Mutex::new(None)),
            workspaces: dashmap::DashMap::new(),
            base_dir,
            model_initialized: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            indexing_workspaces: dashmap::DashMap::new(),
        }
    }

    /// Lazily initialize the Qwen3-Embedding-0.6B model (downloads on first use).
    /// Uses the candle backend (pure Rust, no ONNX) with last-token pooling.
    /// Model weights are downloaded from HuggingFace Hub and cached locally.
    fn ensure_model(&self) -> AppResult<()> {
        if self.model_initialized.load(std::sync::atomic::Ordering::Acquire) {
            return Ok(());
        }

        let mut guard = self.model.lock().map_err(|e| {
            AppError::IndexError(format!("Model lock poisoned: {}", e))
        })?;

        // Double-check after acquiring lock
        if guard.is_some() {
            self.model_initialized
                .store(true, std::sync::atomic::Ordering::Release);
            return Ok(());
        }

        info!(
            "Initializing Qwen3-Embedding-0.6B ({}, {}d, max_len={})...",
            QWEN3_REPO_ID, EMBEDDING_DIM, QWEN3_MAX_LENGTH
        );

        let device = Device::Cpu;
        let model = Qwen3TextEmbedding::from_hf(
            QWEN3_REPO_ID,
            &device,
            DType::F32,
            QWEN3_MAX_LENGTH,
        )
        .map_err(|e| {
            AppError::IndexError(format!("Failed to init Qwen3 embedding model: {}", e))
        })?;

        // Verify dimension matches our constant
        let actual_dim = model.config().hidden_size;
        if actual_dim != EMBEDDING_DIM {
            return Err(AppError::IndexError(format!(
                "Model dimension mismatch: expected {} but got {}",
                EMBEDDING_DIM, actual_dim
            )));
        }

        *guard = Some(model);
        self.model_initialized
            .store(true, std::sync::atomic::Ordering::Release);
        info!(
            "Qwen3-Embedding-0.6B initialized successfully ({}d, candle CPU)",
            EMBEDDING_DIM
        );
        Ok(())
    }

    /// Generate embeddings for a batch of text chunks.
    /// The candle model returns L2-normalized `Vec<Vec<f32>>` via last-token pooling.
    fn embed_texts(&self, texts: &[&str]) -> AppResult<Vec<Vec<f32>>> {
        self.ensure_model()?;
        let guard = self.model.lock().map_err(|e| {
            AppError::IndexError(format!("Model lock poisoned: {}", e))
        })?;
        let model = guard.as_ref().ok_or_else(|| {
            AppError::IndexError("Embedding model not initialized".into())
        })?;

        let docs: Vec<String> = texts.iter().map(|t| t.to_string()).collect();
        model
            .embed(&docs)
            .map_err(|e| AppError::IndexError(format!("Embedding failed: {}", e)))
    }

    /// Get or create a workspace vector index
    fn get_or_create_workspace(
        &self,
        workspace_id: &str,
    ) -> AppResult<Arc<RwLock<WorkspaceVectorState>>> {
        if let Some(ws) = self.workspaces.get(workspace_id) {
            return Ok(ws.value().clone());
        }

        let ws_dir = self.base_dir.join("vectors").join(workspace_id);
        std::fs::create_dir_all(&ws_dir)?;

        let index_path = ws_dir.join("index.usearch");
        let meta_path = ws_dir.join("metadata.json");
        let hash_path = ws_dir.join("content_hashes.json");

        let options = IndexOptions {
            dimensions: EMBEDDING_DIM,
            metric: MetricKind::Cos,
            quantization: ScalarKind::F16,
            connectivity: 16,
            expansion_add: 128,
            expansion_search: 64,
            multi: false,
        };

        let index =
            usearch::Index::new(&options).map_err(|e| {
                AppError::IndexError(format!("Failed to create vector index: {}", e))
            })?;

        // Try to load existing index from disk
        let (metadata, next_key) = if index_path.exists() && meta_path.exists() {
            if let Err(e) = index.load(index_path.to_string_lossy().as_ref()) {
                warn!("Failed to load existing vector index, rebuilding: {}", e);
                Self::reserve_index(&index, 65536)?;
                (HashMap::new(), 0u64)
            } else {
                // Load metadata
                match std::fs::read_to_string(&meta_path) {
                    Ok(json) => {
                        let meta: HashMap<u64, ChunkMeta> =
                            serde_json::from_str(&json).unwrap_or_default();
                        let max_key = meta.keys().copied().max().unwrap_or(0);
                        (meta, max_key + 1)
                    }
                    Err(_) => (HashMap::new(), 0u64),
                }
            }
        } else {
            Self::reserve_index(&index, 65536)?;
            (HashMap::new(), 0u64)
        };

        // Load existing content hashes from disk for deduplication
        let content_hashes = if hash_path.exists() {
            std::fs::read_to_string(&hash_path)
                .ok()
                .and_then(|json| serde_json::from_str::<ContentHashMap>(&json).ok())
                .unwrap_or_default()
        } else {
            ContentHashMap::default()
        };

        let state = Arc::new(RwLock::new(WorkspaceVectorState {
            index,
            metadata,
            next_key,
            index_path,
            meta_path,
            content_hashes,
            hash_path,
            dirty: false,
            last_save: std::time::Instant::now(),
        }));

        self.workspaces
            .insert(workspace_id.to_string(), state.clone());
        Ok(state)
    }

    fn reserve_index(index: &usearch::Index, capacity: usize) -> AppResult<()> {
        index
            .reserve(capacity)
            .map_err(|e| AppError::IndexError(format!("Failed to reserve index capacity: {}", e)))
    }

    /// Embed and index all files for a workspace (smart incremental rebuild).
    /// Uses rayon for parallel text chunking and pipelined batch embedding.
    /// Optional event_tx broadcasts vector indexing progress to WebSocket clients.
    /// Protected by per-workspace atomic CAS guard to prevent concurrent full rebuilds.
    pub fn index_workspace_vectors(
        &self,
        workspace_id: &str,
        files: &[(PathBuf, String, String, String)], // (abs_path, relative_path, content, language)
        event_tx: Option<&tokio::sync::broadcast::Sender<crate::state::ServerEvent>>,
    ) -> AppResult<usize> {
        // Get or create per-workspace indexing guard
        let guard = self.indexing_workspaces
            .entry(workspace_id.to_string())
            .or_insert_with(|| Arc::new(std::sync::atomic::AtomicBool::new(false)))
            .value()
            .clone();

        // Prevent concurrent full vector indexing for this workspace
        if guard.compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        ).is_err() {
            info!("Vector indexing already in progress for workspace {}, skipping duplicate request", workspace_id);
            return Ok(0);
        }

        // Use a scope guard to ensure the flag is always reset, even on panic
        struct IndexGuard(Arc<std::sync::atomic::AtomicBool>);
        impl Drop for IndexGuard {
            fn drop(&mut self) {
                self.0.store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }
        let _guard_reset = IndexGuard(guard);

        self.index_workspace_vectors_inner(workspace_id, files, event_tx)
    }

    /// Internal implementation of smart incremental vector rebuild.
    /// Compares content hashes to skip re-embedding unchanged files.
    /// Only embeds new/changed files and removes vectors for deleted files.
    fn index_workspace_vectors_inner(
        &self,
        workspace_id: &str,
        files: &[(PathBuf, String, String, String)],
        event_tx: Option<&tokio::sync::broadcast::Sender<crate::state::ServerEvent>>,
    ) -> AppResult<usize> {
        let ws_state = self.get_or_create_workspace(workspace_id)?;
        let mut state = ws_state.write();

        // Compute new content hashes for all incoming files
        let new_hashes: HashMap<String, String> = files
            .par_iter()
            .map(|(abs_path, _, content, _)| {
                (abs_path.to_string_lossy().to_string(), compute_content_hash(content))
            })
            .collect();

        let new_file_set: std::collections::HashSet<&str> =
            new_hashes.keys().map(|s| s.as_str()).collect();
        let old_hashes = &state.content_hashes.hashes;

        // Classify files into: unchanged (skip), changed (re-embed), new (embed), removed (delete vectors)
        let mut files_to_embed: Vec<&(PathBuf, String, String, String)> = Vec::new();
        let mut paths_to_remove: Vec<String> = Vec::new();
        let mut unchanged_count = 0usize;

        for file in files {
            let abs_key = file.0.to_string_lossy().to_string();
            let new_hash = new_hashes.get(&abs_key).unwrap();
            match old_hashes.get(&abs_key) {
                Some(existing_hash) if existing_hash == new_hash => {
                    // Content unchanged — skip re-embedding
                    unchanged_count += 1;
                }
                _ => {
                    // New or changed file — needs (re-)embedding
                    files_to_embed.push(file);
                    // If it existed before, mark for vector removal first
                    if old_hashes.contains_key(&abs_key) {
                        paths_to_remove.push(abs_key);
                    }
                }
            }
        }

        // Find files that were in the old index but are no longer present (deleted files)
        for old_path in old_hashes.keys() {
            if !new_file_set.contains(old_path.as_str()) {
                paths_to_remove.push(old_path.clone());
            }
        }

        info!(
            "Smart vector index for workspace {}: {} unchanged (skipped), {} to embed, {} to remove vectors",
            workspace_id, unchanged_count, files_to_embed.len(), paths_to_remove.len()
        );

        // If nothing changed at all, just return the existing count
        if files_to_embed.is_empty() && paths_to_remove.is_empty() {
            let existing_count = state.metadata.len();
            info!(
                "Vector index up-to-date for workspace {} ({} chunks, all files unchanged)",
                workspace_id, existing_count
            );
            // Do NOT broadcast VectorIndexingCompleted for no-op runs.
            // The frontend only needs to know when actual embedding work happened.
            return Ok(existing_count);
        }

        // Remove vectors for changed/deleted files
        for path_to_remove in &paths_to_remove {
            let keys_to_remove: Vec<u64> = state
                .metadata
                .iter()
                .filter(|(_, meta)| &meta.abs_path == path_to_remove)
                .map(|(key, _)| *key)
                .collect();
            for key in keys_to_remove {
                let _ = state.index.remove(key);
                state.metadata.remove(&key);
            }
        }

        // Estimate chunks for capacity planning
        let estimated_new_chunks: usize = files_to_embed
            .iter()
            .map(|(_, _, content, _)| {
                (content.len() / (MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS)).min(MAX_CHUNKS_PER_FILE) + 1
            })
            .sum();

        // Ensure index has enough capacity for new vectors
        let needed_capacity = state.metadata.len() + estimated_new_chunks + 1024;
        let current_capacity = state.index.capacity();
        if needed_capacity > current_capacity {
            let _ = state.index.reserve(needed_capacity.max(65536));
        }

        let mut total_new_chunks = 0usize;

        // Parallel chunking of only the files that need embedding
        let all_chunks: Vec<(String, ChunkMeta)> = files_to_embed
            .par_iter()
            .flat_map(|(abs_path, relative_path, content, language)| {
                let chunks = chunk_text(content, MAX_CHUNK_CHARS, CHUNK_OVERLAP_CHARS, MAX_CHUNKS_PER_FILE);
                chunks
                    .into_iter()
                    .map(|(chunk_text, line_start, line_end)| {
                        (
                            chunk_text.clone(),
                            ChunkMeta {
                                relative_path: relative_path.clone(),
                                abs_path: abs_path.to_string_lossy().to_string(),
                                chunk_text,
                                line_start,
                                line_end,
                                language: language.clone(),
                            },
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .collect();

        if !all_chunks.is_empty() {
            info!("Chunked {} new/changed texts, starting embedding...", all_chunks.len());
        }

        // Embed only the new/changed chunks in batches
        for batch_start in (0..all_chunks.len()).step_by(EMBED_BATCH_SIZE) {
            let batch_end = (batch_start + EMBED_BATCH_SIZE).min(all_chunks.len());
            let batch_texts: Vec<&str> = all_chunks[batch_start..batch_end]
                .iter()
                .map(|(text, _)| text.as_str())
                .collect();

            match self.embed_texts(&batch_texts) {
                Ok(embeddings) => {
                    for (i, embedding) in embeddings.into_iter().enumerate() {
                        let key = state.next_key;
                        state.next_key += 1;

                        if let Err(e) = state.index.add(key, &embedding) {
                            warn!("Failed to add vector {}: {}", key, e);
                            continue;
                        }

                        let meta = all_chunks[batch_start + i].1.clone();
                        state.metadata.insert(key, meta);
                        total_new_chunks += 1;
                    }
                }
                Err(e) => {
                    warn!("Batch embedding failed, skipping batch at {}: {}", batch_start, e);
                }
            }

            // Log progress every 5 batches for better visibility
            if (batch_start / EMBED_BATCH_SIZE) % 5 == 0 && batch_start > 0 {
                let pct = (batch_end as f64 / all_chunks.len() as f64 * 100.0) as u32;
                info!(
                    "Embedding progress: {}/{} chunks ({}%)",
                    batch_end.min(all_chunks.len()),
                    all_chunks.len(),
                    pct
                );
            }

            // Broadcast progress to WebSocket clients every 3 batches
            if let Some(tx) = event_tx {
                if (batch_start / EMBED_BATCH_SIZE) % 3 == 0 {
                    let _ = tx.send(crate::state::ServerEvent::VectorIndexingProgress {
                        workspace_id: workspace_id.to_string(),
                        embedded_chunks: batch_end.min(all_chunks.len()),
                        total_chunks: all_chunks.len(),
                    });
                }
            }
        }

        // Update content hashes to reflect current state
        let mut updated_hashes = ContentHashMap::default();
        for (path, hash) in &new_hashes {
            updated_hashes.hashes.insert(path.clone(), hash.clone());
        }
        state.content_hashes = updated_hashes;

        // Save to disk once (not per-batch)
        self.save_workspace_state(&state)?;

        let total_chunks = state.metadata.len();

        info!(
            "Vector indexing complete for workspace {}: {} total chunks ({} new from {} changed files, {} unchanged files skipped)",
            workspace_id,
            total_chunks,
            total_new_chunks,
            files_to_embed.len(),
            unchanged_count,
        );

        // Broadcast completion event
        if let Some(tx) = event_tx {
            let _ = tx.send(crate::state::ServerEvent::VectorIndexingCompleted {
                workspace_id: workspace_id.to_string(),
                total_chunks,
                duration_ms: 0, // Duration tracked at caller level
            });
        }

        Ok(total_chunks)
    }

    /// Incrementally update vectors for a single file.
    /// Uses content hash deduplication to skip re-embedding unchanged files.
    /// Skips if a full vector indexing is currently in progress for this workspace.
    /// Throttles disk saves to avoid I/O storms during rapid file changes.
    pub fn reindex_file_vectors(
        &self,
        workspace_id: &str,
        abs_path: &str,
        relative_path: &str,
        content: &str,
        language: &str,
        change_type: &str,
    ) -> AppResult<()> {
        // Skip incremental reindex if a full rebuild is in progress for this workspace
        if let Some(guard) = self.indexing_workspaces.get(workspace_id) {
            if guard.value().load(std::sync::atomic::Ordering::Relaxed) {
                return Ok(());
            }
        }

        let ws_state = match self.workspaces.get(workspace_id) {
            Some(s) => s.value().clone(),
            None => return Ok(()), // No vector index yet
        };

        let mut state = ws_state.write();

        // Content hash deduplication: skip re-embedding if content hasn't changed
        if change_type != "remove" && !content.is_empty() {
            let new_hash = compute_content_hash(content);
            if let Some(existing_hash) = state.content_hashes.hashes.get(abs_path) {
                if *existing_hash == new_hash {
                    return Ok(()); // Content unchanged, skip re-embedding
                }
            }
            // Update the hash for this file
            state.content_hashes.hashes.insert(abs_path.to_string(), new_hash);
        } else if change_type == "remove" {
            state.content_hashes.hashes.remove(abs_path);
        }

        // Remove existing vectors for this file
        let keys_to_remove: Vec<u64> = state
            .metadata
            .iter()
            .filter(|(_, meta)| meta.abs_path == abs_path)
            .map(|(key, _)| *key)
            .collect();

        for key in &keys_to_remove {
            let _ = state.index.remove(*key);
            state.metadata.remove(key);
        }

        // Re-embed if not a removal
        if change_type != "remove" && !content.is_empty() {
            let chunks = chunk_text(content, MAX_CHUNK_CHARS, CHUNK_OVERLAP_CHARS, MAX_CHUNKS_PER_FILE);
            let chunk_texts: Vec<&str> = chunks.iter().map(|(t, _, _)| t.as_str()).collect();

            if let Ok(embeddings) = self.embed_texts(&chunk_texts) {
                for (i, embedding) in embeddings.into_iter().enumerate() {
                    let key = state.next_key;
                    state.next_key += 1;

                    // Ensure capacity
                    let current_len = state.index.size();
                    let current_capacity = state.index.capacity();
                    if current_len + 1 >= current_capacity {
                        let _ = state.index.reserve(current_capacity * 2);
                    }

                    if let Err(e) = state.index.add(key, &embedding) {
                        warn!("Failed to add vector: {}", e);
                        continue;
                    }

                    let (chunk_text, line_start, line_end) = &chunks[i];
                    state.metadata.insert(
                        key,
                        ChunkMeta {
                            relative_path: relative_path.to_string(),
                            abs_path: abs_path.to_string(),
                            chunk_text: chunk_text.clone(),
                            line_start: *line_start,
                            line_end: *line_end,
                            language: language.to_string(),
                        },
                    );
                }
            }
        }

        // Throttled save: only persist to disk if enough time has passed since last save.
        // This prevents I/O storms during rapid file changes (e.g., git checkout, batch saves).
        // Data is still in memory and will be persisted on the next save cycle or on shutdown.
        state.dirty = true;
        const SAVE_THROTTLE_SECS: u64 = 10;
        if state.last_save.elapsed() >= std::time::Duration::from_secs(SAVE_THROTTLE_SECS) {
            self.save_workspace_state(&state)?;
            state.dirty = false;
            state.last_save = std::time::Instant::now();
        }

        Ok(())
    }

    /// Flush any dirty workspace state to disk.
    /// Called on shutdown or when explicitly requested.
    pub fn flush_all(&self) {
        for entry in self.workspaces.iter() {
            let mut state = entry.value().write();
            if state.dirty {
                if let Err(e) = self.save_workspace_state(&state) {
                    warn!("Failed to flush workspace state: {}", e);
                } else {
                    state.dirty = false;
                    state.last_save = std::time::Instant::now();
                }
            }
        }
    }

    /// Perform semantic search using vector similarity.
    /// Adds the Qwen3 instruction prefix to the query for optimal retrieval quality.
    pub fn semantic_search(
        &self,
        workspace_id: &str,
        query: &str,
        limit: usize,
    ) -> AppResult<SemanticSearchResponse> {
        let start = std::time::Instant::now();

        let ws_state = match self.workspaces.get(workspace_id) {
            Some(s) => s.value().clone(),
            None => {
                return Ok(SemanticSearchResponse {
                    results: vec![],
                    query_time_ms: 0,
                });
            }
        };

        // Embed the query with Qwen3 instruction prefix for retrieval.
        // Qwen3-Embedding is instruction-aware: queries benefit from an
        // "Instruct: ...\nQuery: ..." prefix, while documents are embedded raw.
        // See: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B#usage
        let instructed_query = format!(
            "Instruct: Retrieve semantically similar source code or documentation\nQuery: {}",
            query
        );
        let query_embeddings = self.embed_texts(&[instructed_query.as_str()])?;
        let query_vec = query_embeddings
            .into_iter()
            .next()
            .ok_or_else(|| AppError::IndexError("Failed to embed query".into()))?;

        let state = ws_state.read();

        if state.index.size() == 0 {
            return Ok(SemanticSearchResponse {
                results: vec![],
                query_time_ms: start.elapsed().as_millis() as u64,
            });
        }

        // Search the vector index
        let search_result = state
            .index
            .search(&query_vec, limit)
            .map_err(|e| AppError::SearchError(format!("Vector search failed: {}", e)))?;

        let mut results = Vec::with_capacity(search_result.keys.len());

        for (key, distance) in search_result
            .keys
            .iter()
            .zip(search_result.distances.iter())
        {
            if let Some(meta) = state.metadata.get(key) {
                // Convert cosine distance to similarity score (1 - distance)
                let score = 1.0 - distance;
                results.push(SemanticSearchResult {
                    path: meta.abs_path.clone(),
                    relative_path: meta.relative_path.clone(),
                    chunk_text: meta.chunk_text.clone(),
                    score,
                    line_start: meta.line_start,
                    line_end: meta.line_end,
                    language: meta.language.clone(),
                });
            }
        }

        let query_time_ms = start.elapsed().as_millis() as u64;

        Ok(SemanticSearchResponse {
            results,
            query_time_ms,
        })
    }

    /// Remove all vector data for a workspace
    pub fn remove_workspace(&self, workspace_id: &str) -> AppResult<()> {
        self.workspaces.remove(workspace_id);
        let vec_dir = self.base_dir.join("vectors").join(workspace_id);
        if vec_dir.exists() {
            std::fs::remove_dir_all(vec_dir)?;
        }
        Ok(())
    }

    /// Check if embedding model is ready
    pub fn is_model_ready(&self) -> bool {
        self.model_initialized
            .load(std::sync::atomic::Ordering::Acquire)
    }

    /// Ensure workspace vector data is loaded from disk into memory.
    /// Safe to call multiple times — no-op if already loaded.
    /// This is the public API for routes that only need to trigger loading.
    pub fn ensure_workspace_loaded(&self, workspace_id: &str) -> AppResult<()> {
        let _ = self.get_or_create_workspace(workspace_id)?;
        Ok(())
    }

    /// Get vector index stats for a workspace.
    /// Auto-loads from disk if not yet in memory to prevent false negatives.
    pub fn get_stats(&self, workspace_id: &str) -> (usize, bool) {
        // Auto-load from disk if not yet in memory
        if !self.workspaces.contains_key(workspace_id) {
            let ws_dir = self.base_dir.join("vectors").join(workspace_id);
            if ws_dir.join("index.usearch").exists() && ws_dir.join("metadata.json").exists() {
                let _ = self.get_or_create_workspace(workspace_id);
            }
        }

        match self.workspaces.get(workspace_id) {
            Some(ws) => {
                let state = ws.value().read();
                (state.index.size(), true)
            }
            None => (0, false),
        }
    }

    fn save_workspace_state(&self, state: &WorkspaceVectorState) -> AppResult<()> {
        // Save the HNSW index
        state
            .index
            .save(state.index_path.to_string_lossy().as_ref())
            .map_err(|e| {
                AppError::IndexError(format!("Failed to save vector index: {}", e))
            })?;

        // Save metadata
        let json = serde_json::to_string(&state.metadata)?;
        std::fs::write(&state.meta_path, json)?;

        // Save content hashes for deduplication
        let hash_json = serde_json::to_string(&state.content_hashes)?;
        std::fs::write(&state.hash_path, hash_json)?;

        Ok(())
    }

    /// Check if vector indexing is currently in progress for any workspace
    pub fn is_indexing(&self) -> bool {
        self.indexing_workspaces.iter().any(|entry| {
            entry.value().load(std::sync::atomic::Ordering::Relaxed)
        })
    }
}

// ---------------------------------------------------------------------------
// Content hashing for deduplication
// ---------------------------------------------------------------------------

/// Compute a SHA-256 hash of file content for deduplication.
/// Used to skip re-embedding files whose content hasn't changed.
fn compute_content_hash(content: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

// ---------------------------------------------------------------------------
// Text chunking utilities
// ---------------------------------------------------------------------------

/// Chunk text into overlapping segments suitable for embedding.
/// Returns (chunk_text, line_start, line_end) tuples.
fn chunk_text(
    content: &str,
    max_chars: usize,
    overlap: usize,
    max_chunks: usize,
) -> Vec<(String, usize, usize)> {
    if content.is_empty() {
        return vec![];
    }

    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return vec![];
    }

    let mut chunks = Vec::new();
    let mut current_chars = 0usize;
    let mut chunk_start_line = 0usize;
    let mut chunk_lines: Vec<&str> = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        let line_chars = line.len() + 1; // +1 for newline

        if current_chars + line_chars > max_chars && !chunk_lines.is_empty() {
            // Emit current chunk
            let text = chunk_lines.join("\n");
            chunks.push((text, chunk_start_line + 1, i)); // 1-indexed lines

            if chunks.len() >= max_chunks {
                break;
            }

            // Calculate overlap: back up by overlap chars
            let mut overlap_chars = 0;
            let mut overlap_start = chunk_lines.len();
            for (j, cl) in chunk_lines.iter().enumerate().rev() {
                overlap_chars += cl.len() + 1;
                if overlap_chars >= overlap {
                    overlap_start = j;
                    break;
                }
            }

            let kept_lines: Vec<&str> = chunk_lines[overlap_start..].to_vec();
            let kept_chars: usize = kept_lines.iter().map(|l| l.len() + 1).sum();

            chunk_lines = kept_lines;
            current_chars = kept_chars;
            chunk_start_line = chunk_start_line + overlap_start;
        }

        chunk_lines.push(line);
        current_chars += line_chars;
    }

    // Emit final chunk
    if !chunk_lines.is_empty() && chunks.len() < max_chunks {
        let text = chunk_lines.join("\n");
        let end_line = lines.len();
        chunks.push((text, chunk_start_line + 1, end_line));
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_text_basic() {
        let content = "line1\nline2\nline3\nline4\nline5";
        let chunks = chunk_text(content, 20, 5, 100);
        assert!(!chunks.is_empty());
        // First chunk should start at line 1
        assert_eq!(chunks[0].1, 1);
    }

    #[test]
    fn test_chunk_text_empty() {
        let chunks = chunk_text("", 512, 64, 100);
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_chunk_text_small() {
        let content = "hello world";
        let chunks = chunk_text(content, 512, 64, 100);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].0, "hello world");
    }

    #[test]
    fn test_chunk_text_max_chunks() {
        let content = (0..1000).map(|i| format!("line {}", i)).collect::<Vec<_>>().join("\n");
        let chunks = chunk_text(&content, 50, 10, 5);
        assert!(chunks.len() <= 5);
    }
}
