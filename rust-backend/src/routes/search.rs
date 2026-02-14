use axum::{
    extract::{Path, State},
    Json,
};

use crate::error::AppResult;
use crate::search::{self, GrepQuery, GrepResponse, SearchQuery, SearchResponse};
use crate::embedder::SemanticSearchResponse;
use crate::state::AppState;

/// Spawn a background task that runs both full-text and vector indexing.
/// This deduplicates the identical pattern used in index_workspace, create_workspace,
/// activate_workspace, and trigger_index WS commands.
/// Each inner function has its own CAS guard + smart hash dedup, so duplicate
/// calls are safe (they'll skip work if nothing changed).  However, we check
/// `is_indexing` up-front to avoid spawning a task that immediately bails out.
pub fn spawn_background_indexing(
    workspace_id: String,
    workspace_path: String,
    index_manager: std::sync::Arc<crate::indexer::IndexManager>,
    embedding_manager: std::sync::Arc<crate::embedder::EmbeddingManager>,
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
        let mut fulltext_ok = false;

        // Full-text indexing (Tantivy)
        if let Err(e) = index_manager.index_workspace(&workspace_id, &workspace_path, event_tx.clone()).await {
            tracing::error!("Full-text indexing failed for {}: {}", workspace_id, e);
            let _ = event_tx.send(crate::state::ServerEvent::IndexingError {
                workspace_id: workspace_id.clone(),
                error: e.to_string(),
            });
        } else {
            fulltext_ok = true;
            let status = index_manager
                .get_index_status(&workspace_id)
                .unwrap_or_default();
            let _ = workspace_manager.update_workspace_stats(
                &workspace_id,
                status.indexed_count,
                status.total_size_bytes,
                true,
            );
        }

        // Vector embedding indexing (fastembed + usearch)
        let emb = embedding_manager.clone();
        let ws_id2 = workspace_id.clone();
        let ws_path2 = workspace_path.clone();
        let etx2 = event_tx.clone();
        let vector_ok = tokio::task::spawn_blocking(move || {
            let files = collect_indexable_files_pub(&ws_path2);
            match emb.index_workspace_vectors(&ws_id2, &files, Some(&etx2)) {
                Ok(chunks) => {
                    tracing::info!("Vector indexing complete for {}: {} chunks", ws_id2, chunks);
                    true
                }
                Err(e) => {
                    tracing::error!("Vector indexing failed for {}: {}", ws_id2, e);
                    let _ = etx2.send(crate::state::ServerEvent::IndexingError {
                        workspace_id: ws_id2.clone(),
                        error: format!("Vector indexing failed: {}", e),
                    });
                    false
                }
            }
        })
        .await
        .unwrap_or(false);

        // Emit SearchReady when both indexes are available
        if fulltext_ok || vector_ok {
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
        state.embedding_manager.clone(),
        state.workspace_manager.clone(),
        state.event_tx.clone(),
    );

    Ok(Json(serde_json::json!({
        "status": "indexing_started",
        "workspace_id": workspace_id,
    })))
}

/// Collect files suitable for embedding from a workspace path.
/// Uses rayon for parallel file reading to maximize I/O throughput.
pub fn collect_indexable_files_pub(
    workspace_path: &str,
) -> Vec<(std::path::PathBuf, String, String, String)> {
    use crate::indexer::IndexManager;
    use ignore::WalkBuilder;
    use rayon::prelude::*;

    let max_file_size: u64 = 10 * 1024 * 1024; // 10MB

    let walker = WalkBuilder::new(workspace_path)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .max_depth(Some(20))
        .build();

    // First pass: collect paths that pass all filters (fast, sequential directory walk)
    let paths: Vec<std::path::PathBuf> = walker
        .filter_map(|e| e.ok())
        .filter(|entry| entry.file_type().is_some_and(|ft| ft.is_file()))
        .filter(|entry| !IndexManager::is_build_or_output_dir(entry.path()))
        .filter(|entry| {
            entry.metadata().map(|m| m.len() > 0 && m.len() <= max_file_size).unwrap_or(false)
        })
        .filter(|entry| {
            let ext = entry.path()
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            is_embeddable_ext(&ext)
        })
        .map(|entry| entry.into_path())
        .collect();

    // Second pass: parallel file reading using rayon (I/O-bound, benefits from parallelism)
    paths
        .par_iter()
        .filter_map(|path| {
            let content = std::fs::read_to_string(path).ok()?;
            let relative = path
                .strip_prefix(workspace_path)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");

            let ext = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();

            let language = detect_language_for_embedding(&ext);
            Some((path.to_path_buf(), relative, content, language))
        })
        .collect()
}

/// Check if a file extension is suitable for embedding.
/// Delegates to the shared canonical list in config.rs.
fn is_embeddable_ext(ext: &str) -> bool {
    crate::config::is_supported_extension(ext)
}

fn detect_language_for_embedding(ext: &str) -> String {
    crate::lang::detect_language(ext).to_string()
}

pub async fn index_status(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let status = state.index_manager.get_index_status(&workspace_id)?;
    let (vector_count, vector_ready) = state.embedding_manager.get_stats(&workspace_id);
    let model_ready = state.embedding_manager.is_model_ready();

    let is_vector_indexing = state.embedding_manager.is_indexing();

    Ok(Json(serde_json::json!({
        "indexed": status.indexed,
        "is_indexing": status.is_indexing,
        "is_vector_indexing": is_vector_indexing,
        "indexed_count": status.indexed_count,
        "total_count": status.total_count,
        "vector_count": vector_count,
        "vector_ready": vector_ready,
        "embedding_model_ready": model_ready,
    })))
}

/// Full-text search (Tantivy BM25) — renamed from misleading "semantic_search"
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
    let response = search::search_workspace(&state.index_manager, &workspace_id, &query)?;
    Ok(Json(response))
}

/// True semantic search using vector embeddings (fastembed + usearch)
pub async fn semantic_search(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<SemanticSearchResponse>> {
    let query = body
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    // Validate query is not empty
    if query.trim().is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "Search query must not be empty".to_string(),
        ));
    }

    // Validate query length to prevent abuse
    if query.len() > crate::config::MAX_SEARCH_QUERY_LENGTH {
        return Err(crate::error::AppError::BadRequest(format!(
            "Search query too long ({} chars). Maximum allowed is {}.",
            query.len(),
            crate::config::MAX_SEARCH_QUERY_LENGTH,
        )));
    }
    
    let limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20) as usize;
    
    // Clamp limit to a reasonable upper bound
    let limit = limit.min(1000);

    // Run embedding + search in blocking context (candle model is sync)
    let emb = state.embedding_manager.clone();
    let ws_id = workspace_id.clone();

    let response = tokio::task::spawn_blocking(move || {
        search::vector_semantic_search(&emb, &ws_id, &query, limit)
    })
    .await
    .map_err(|e| crate::error::AppError::IndexError(format!("Semantic search task failed: {}", e)))??;

    Ok(Json(response))
}

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
    let response = search::grep_workspace(ws.root_path(), &query)?;
    Ok(Json(response))
}
