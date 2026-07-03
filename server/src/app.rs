use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;
use tower_http::services::ServeDir;

use crate::db;

#[derive(Clone)]
struct AppState {
    db_path: Arc<PathBuf>,
}

/// Builds the Axum router against a SQLite database path and an EPUB
/// directory (served under `/epubs`). `static_dir` (the built frontend) is
/// wired in task 7.1; unused for now.
pub fn build_app(db_path: &Path, epub_dir: &Path, _static_dir: Option<&Path>) -> Router {
    let state = AppState {
        db_path: Arc::new(db_path.to_path_buf()),
    };

    Router::new()
        .route("/api/books", get(list_books))
        .route("/api/books/{id}", get(get_book))
        .route("/healthz", get(healthz))
        .with_state(state)
        .nest_service("/epubs", ServeDir::new(epub_dir))
}

fn error_response(status: StatusCode, code: &str, message: impl Into<String>) -> Response {
    (
        status,
        Json(json!({ "error": { "code": code, "message": message.into() } })),
    )
        .into_response()
}

fn db_error_response(err: rusqlite::Error) -> Response {
    tracing::error!(?err, "database error");
    error_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        "internal_error",
        "database error",
    )
}

async fn list_books(State(state): State<AppState>) -> Response {
    match db::list_books(&state.db_path) {
        Ok(books) => Json(books).into_response(),
        Err(err) => db_error_response(err),
    }
}

async fn get_book(State(state): State<AppState>, AxumPath(id): AxumPath<i64>) -> Response {
    match db::get_book(&state.db_path, id) {
        Ok(Some(book)) => Json(book).into_response(),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "not_found",
            format!("book {id} does not exist"),
        ),
        Err(err) => db_error_response(err),
    }
}

async fn healthz(State(state): State<AppState>) -> Response {
    match db::count_books(&state.db_path) {
        Ok(count) => Json(json!({ "status": "ok", "books": count })).into_response(),
        Err(err) => db_error_response(err),
    }
}
