use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use tracing::{info, warn, debug, instrument};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::workspace::FileEntry;

#[derive(Debug, Deserialize)]
pub struct ListFilesQuery {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub recursive: Option<bool>,
    #[serde(default)]
    pub show_hidden: Option<bool>,
    #[serde(default)]
    pub max_depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct FilePathRequest {
    pub path: String,
}

/// Query-based file read (for GET requests)
#[derive(Debug, Deserialize)]
pub struct ReadFileQuery {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveRequest {
    pub source: String,
    pub destination: String,
}

#[derive(Debug, Deserialize)]
pub struct CopyRequest {
    pub source: String,
    pub destination: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchFilesRequest {
    pub query: String,
    #[serde(default)]
    pub file_types: Option<Vec<String>>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    100
}

#[derive(Debug, Serialize)]
pub struct ReadFileResponse {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub language: String,
    pub encoding: String,
}

#[instrument(skip(state), fields(workspace_id = %workspace_id))]
pub async fn list_files(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Query(params): Query<ListFilesQuery>,
) -> AppResult<Json<Vec<FileEntry>>> {
    let relative_path = params.path.unwrap_or_default();
    let recursive = params.recursive.unwrap_or(false);
    let show_hidden = params.show_hidden.unwrap_or(false);
    let max_depth = params.max_depth.unwrap_or(1);

    debug!(path = %relative_path, recursive, show_hidden, max_depth, "Listing files");

    let entries = state.workspace_manager.list_directory(
        &workspace_id,
        &relative_path,
        recursive,
        show_hidden,
        max_depth,
    )?;

    debug!(count = entries.len(), "Listed files");
    Ok(Json(entries))
}

pub async fn read_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<FilePathRequest>,
) -> AppResult<Json<ReadFileResponse>> {
    read_file_inner(state, &workspace_id, &req.path).await
}

/// GET handler for reading files via query parameter
pub async fn read_file_query(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Query(query): Query<ReadFileQuery>,
) -> AppResult<Json<ReadFileResponse>> {
    read_file_inner(state, &workspace_id, &query.path).await
}

async fn read_file_inner(
    state: AppState,
    workspace_id: &str,
    file_path: &str,
) -> AppResult<Json<ReadFileResponse>> {
    let full_path = state.workspace_manager.validate_path(workspace_id, file_path)?;

    if !full_path.is_file() {
        warn!(workspace_id, path = file_path, "File not found");
        return Err(AppError::FileNotFound(file_path.to_string()));
    }

    let metadata = std::fs::metadata(&full_path)?;
    if metadata.len() > state.config.max_file_size_bytes as u64 {
        warn!(workspace_id, path = file_path, size = metadata.len(), max = state.config.max_file_size_bytes, "File too large to read");
        return Err(AppError::BadRequest("File too large to read".into()));
    }

    let content = tokio::fs::read_to_string(&full_path).await?;
    let extension = full_path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    debug!(workspace_id, path = file_path, size = metadata.len(), "File read");

    Ok(Json(ReadFileResponse {
        path: file_path.to_string(),
        content,
        size: metadata.len(),
        language: detect_language(&extension),
        encoding: "utf-8".into(),
    }))
}

#[instrument(skip(state, req), fields(workspace_id = %workspace_id, path = %req.path))]
pub async fn write_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<WriteFileRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let full_path = state.workspace_manager.validate_path(&workspace_id, &req.path)?;
    
    // Ensure parent directory exists
    if let Some(parent) = full_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let size = req.content.len();
    tokio::fs::write(&full_path, &req.content).await?;

    info!(path = %req.path, size, "File written");

    Ok(Json(serde_json::json!({
        "success": true,
        "path": req.path,
        "size": size
    })))
}

#[instrument(skip(state, req), fields(workspace_id = %workspace_id, path = %req.path))]
pub async fn create_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<WriteFileRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let full_path = state.workspace_manager.validate_path(&workspace_id, &req.path)?;

    if full_path.exists() {
        warn!(path = %req.path, "Cannot create file: already exists");
        return Err(AppError::BadRequest(format!(
            "File already exists: {}",
            req.path
        )));
    }

    if let Some(parent) = full_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    tokio::fs::write(&full_path, &req.content).await?;

    info!(path = %req.path, size = req.content.len(), "File created");

    Ok(Json(serde_json::json!({
        "success": true,
        "path": req.path
    })))
}

#[instrument(skip(state), fields(workspace_id = %workspace_id, path = %req.path))]
pub async fn delete_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<FilePathRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let full_path = state.workspace_manager.validate_path(&workspace_id, &req.path)?;

    if !full_path.exists() {
        warn!(path = %req.path, "Cannot delete: file not found");
        return Err(AppError::FileNotFound(req.path));
    }

    let is_dir = full_path.is_dir();
    if is_dir {
        tokio::fs::remove_dir_all(&full_path).await?;
    } else {
        tokio::fs::remove_file(&full_path).await?;
    }

    info!(path = %req.path, is_dir, "File deleted");

    Ok(Json(serde_json::json!({
        "success": true,
        "path": req.path
    })))
}

#[instrument(skip(state), fields(workspace_id = %workspace_id))]
pub async fn rename_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<RenameRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let old_path = state.workspace_manager.validate_path(&workspace_id, &req.old_path)?;
    let new_path = state.workspace_manager.validate_path(&workspace_id, &req.new_path)?;

    if !old_path.exists() {
        warn!(old_path = %req.old_path, "Cannot rename: source not found");
        return Err(AppError::FileNotFound(req.old_path));
    }

    if let Some(parent) = new_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    tokio::fs::rename(&old_path, &new_path).await?;

    info!(old_path = %req.old_path, new_path = %req.new_path, "File renamed");

    Ok(Json(serde_json::json!({
        "success": true,
        "old_path": req.old_path,
        "new_path": req.new_path,
    })))
}

#[instrument(skip(state), fields(workspace_id = %workspace_id))]
pub async fn move_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<MoveRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let source = state.workspace_manager.validate_path(&workspace_id, &req.source)?;
    let destination = state.workspace_manager.validate_path(&workspace_id, &req.destination)?;

    if !source.exists() {
        warn!(source = %req.source, "Cannot move: source not found");
        return Err(AppError::FileNotFound(req.source));
    }

    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    tokio::fs::rename(&source, &destination).await?;

    info!(source = %req.source, destination = %req.destination, "File moved");

    Ok(Json(serde_json::json!({
        "success": true,
        "source": req.source,
        "destination": req.destination,
    })))
}

#[instrument(skip(state), fields(workspace_id = %workspace_id))]
pub async fn copy_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<CopyRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let source = state.workspace_manager.validate_path(&workspace_id, &req.source)?;
    let destination = state.workspace_manager.validate_path(&workspace_id, &req.destination)?;

    if !source.exists() {
        warn!(source = %req.source, "Cannot copy: source not found");
        return Err(AppError::FileNotFound(req.source));
    }

    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let is_dir = source.is_dir();
    if is_dir {
        copy_dir_recursive(&source, &destination).await?;
    } else {
        tokio::fs::copy(&source, &destination).await?;
    }

    info!(source = %req.source, destination = %req.destination, is_dir, "File copied");

    Ok(Json(serde_json::json!({
        "success": true,
        "source": req.source,
        "destination": req.destination,
    })))
}

pub async fn stat_file(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<FilePathRequest>,
) -> AppResult<Json<crate::workspace::FileStats>> {
    let stats = state.workspace_manager.get_file_stats(&workspace_id, &req.path)?;
    Ok(Json(stats))
}

/// Create a new directory (mkdir -p behavior)
#[instrument(skip(state), fields(workspace_id = %workspace_id, path = %req.path))]
pub async fn create_directory(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<FilePathRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let full_path = state.workspace_manager.validate_path(&workspace_id, &req.path)?;

    if full_path.exists() {
        if full_path.is_dir() {
            debug!(path = %req.path, "Directory already exists");
            return Ok(Json(serde_json::json!({ "success": true, "path": req.path, "already_exists": true })));
        }
        warn!(path = %req.path, "Cannot create directory: path is a file");
        return Err(AppError::BadRequest(format!("Path is a file, not a directory: {}", req.path)));
    }

    tokio::fs::create_dir_all(&full_path).await?;

    info!(path = %req.path, "Directory created");

    Ok(Json(serde_json::json!({
        "success": true,
        "path": req.path
    })))
}

#[instrument(skip(state), fields(workspace_id = %workspace_id, query = %req.query))]
pub async fn search_files(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(req): Json<SearchFilesRequest>,
) -> AppResult<Json<Vec<FileEntry>>> {
    let _ws = state.workspace_manager.get_workspace(&workspace_id)?;
    let all_entries = state.workspace_manager.list_directory(
        &workspace_id,
        "",
        true,
        false,
        10,
    )?;

    let query_lower = req.query.to_lowercase();

    // Normalize file_types filter: lowercase extensions, strip leading dots
    let file_type_filter: Option<Vec<String>> = req.file_types.map(|types| {
        types
            .into_iter()
            .map(|t| t.to_lowercase().trim_start_matches('.').to_string())
            .collect()
    });

    let results: Vec<FileEntry> = all_entries
        .into_iter()
        .filter(|entry| {
            let name_match = entry.name.to_lowercase().contains(&query_lower);
            let path_match = entry.relative_path.to_lowercase().contains(&query_lower);
            let text_match = name_match || path_match;

            // Apply file_types filter if provided
            if let Some(ref types) = file_type_filter {
                let ext = entry
                    .extension
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase();
                text_match && (types.is_empty() || types.contains(&ext))
            } else {
                text_match
            }
        })
        .take(req.limit)
        .collect();

    debug!(results = results.len(), "File search completed");

    Ok(Json(results))
}

async fn copy_dir_recursive(
    src: &std::path::Path,
    dst: &std::path::Path,
) -> std::io::Result<()> {
    tokio::fs::create_dir_all(dst).await?;

    let mut read_dir = tokio::fs::read_dir(src).await?;
    while let Some(entry) = read_dir.next_entry().await? {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if entry.file_type().await?.is_dir() {
            Box::pin(copy_dir_recursive(&src_path, &dst_path)).await?;
        } else {
            tokio::fs::copy(&src_path, &dst_path).await?;
        }
    }

    Ok(())
}

fn detect_language(extension: &str) -> String {
    crate::lang::detect_language(extension).to_string()
}
