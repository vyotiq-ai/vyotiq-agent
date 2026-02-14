use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),

    #[error("Workspace already exists: {0}")]
    WorkspaceAlreadyExists(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Path not allowed: {0}")]
    PathNotAllowed(String),

    #[error("Index error: {0}")]
    IndexError(String),

    #[error("Search error: {0}")]
    SearchError(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),

    #[error("Bad request: {0}")]
    BadRequest(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::WorkspaceNotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::WorkspaceAlreadyExists(_) => (StatusCode::CONFLICT, self.to_string()),
            AppError::FileNotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::PathNotAllowed(_) => (StatusCode::FORBIDDEN, self.to_string()),
            AppError::IndexError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::SearchError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::Io(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::Serde(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            ),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
        };

        let body = json!({
            "error": message,
            "status": status.as_u16(),
        });

        (status, Json(body)).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
