use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use crate::error::AppResult;
use crate::state::{AppState, ServerEvent};

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    /// Accepts both "path" and "root_path" from the client
    #[serde(alias = "root_path")]
    pub path: String,
}

pub async fn list_workspaces(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<crate::workspace::Workspace>>> {
    let workspaces = state.workspace_manager.list_workspaces();
    Ok(Json(workspaces))
}

pub async fn create_workspace(
    State(state): State<AppState>,
    Json(req): Json<CreateWorkspaceRequest>,
) -> AppResult<Json<crate::workspace::Workspace>> {
    let workspace = state.workspace_manager.create_workspace(req.name, req.path.clone())?;

    // Start watching the workspace with incremental re-indexing
    if let Err(e) = state.watcher_manager.start_watching(
        &workspace.id,
        &workspace.path,
        Some(state.index_manager.clone()),
        Some(state.embedding_manager.clone()),
    ) {
        tracing::warn!("Failed to start file watcher for workspace: {}", e);
    }

    // Start background indexing (full-text + vector) using shared helper
    crate::routes::search::spawn_background_indexing(
        workspace.id.clone(),
        workspace.path.clone(),
        state.index_manager.clone(),
        state.embedding_manager.clone(),
        state.workspace_manager.clone(),
        state.event_tx.clone(),
    );

    let _ = state.event_tx.send(ServerEvent::WorkspaceCreated {
        workspace_id: workspace.id.clone(),
        path: workspace.path.clone(),
    });

    Ok(Json(workspace))
}

pub async fn get_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<crate::workspace::Workspace>> {
    let workspace = state.workspace_manager.get_workspace(&workspace_id)?;
    Ok(Json(workspace))
}

pub async fn remove_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    state.watcher_manager.stop_watching(&workspace_id);
    let _ = state.index_manager.remove_index(&workspace_id);
    let _ = state.embedding_manager.remove_workspace(&workspace_id);
    state.workspace_manager.remove_workspace(&workspace_id)?;

    let _ = state.event_tx.send(ServerEvent::WorkspaceRemoved {
        workspace_id: workspace_id.clone(),
    });

    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn activate_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> AppResult<Json<crate::workspace::Workspace>> {
    let workspace = state.workspace_manager.activate_workspace(&workspace_id)?;

    // Ensure watcher is running with index manager
    if !state.watcher_manager.is_watching(&workspace_id) {
        if let Err(e) = state.watcher_manager.start_watching(
            &workspace_id,
            &workspace.path,
            Some(state.index_manager.clone()),
            Some(state.embedding_manager.clone()),
        ) {
            tracing::warn!("Failed to start file watcher: {}", e);
        }
    }

    // Ensure indexes are loaded from disk (they persist across restarts)
    // This is a cheap operation if the index is already loaded in memory.
    // Log errors instead of silently ignoring them — a failure here means
    // the data may not be loadable and indexing will be needed.
    if let Err(e) = state.index_manager.get_or_create_index(&workspace_id) {
        tracing::warn!("Failed to load full-text index for {}: {} — will re-index", workspace_id, e);
    }
    if let Err(e) = state.embedding_manager.ensure_workspace_loaded(&workspace_id) {
        tracing::warn!("Failed to load vector index for {}: {} — will re-index", workspace_id, e);
    }

    // Auto-trigger background indexing if workspace is not yet indexed
    let index_status = state.index_manager.get_index_status(&workspace_id).unwrap_or_default();
    if !index_status.indexed && !index_status.is_indexing {
        crate::routes::search::spawn_background_indexing(
            workspace_id.clone(),
            workspace.path.clone(),
            state.index_manager.clone(),
            state.embedding_manager.clone(),
            state.workspace_manager.clone(),
            state.event_tx.clone(),
        );
    }

    Ok(Json(workspace))
}
