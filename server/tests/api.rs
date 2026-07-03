use http_body_util::BodyExt;
use serde_json::Value;
use server::app::build_app;
use tempfile::tempdir;
use tower::ServiceExt;

fn seed_db(path: &std::path::Path) {
    server::db::migrate(path).unwrap();
    let conn = rusqlite::Connection::open(path).unwrap();
    conn.execute_batch(
        "
        INSERT INTO books (id, title, author, synopsis, epub_url, spine_color, page_count)
        VALUES
            (2, 'Frankenstein', 'Mary Shelley', NULL, 'https://example.org/f.epub', NULL, NULL),
            (1, 'Moby-Dick', 'Herman Melville', 'A whale hunt.', '/epubs/moby-dick.epub', '#1F3A5F', 635);
        ",
    )
    .unwrap();
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn list_books_ordered_and_shaped() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    seed_db(&db_path);

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/books")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = body_json(response).await;
    let books = body.as_array().unwrap();
    assert_eq!(books.len(), 2);

    // Ordered by id ascending, regardless of insertion order.
    assert_eq!(books[0]["id"], 1);
    assert_eq!(books[1]["id"], 2);

    // camelCase field names, full shape present.
    assert_eq!(books[0]["title"], "Moby-Dick");
    assert_eq!(books[0]["author"], "Herman Melville");
    assert_eq!(books[0]["synopsis"], "A whale hunt.");
    assert_eq!(books[0]["epubUrl"], "/epubs/moby-dick.epub");
    assert_eq!(books[0]["spineColor"], "#1F3A5F");
    assert_eq!(books[0]["pageCount"], 635);
}

#[tokio::test]
async fn list_books_missing_optional_fields_are_null() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    seed_db(&db_path);

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/books")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = body_json(response).await;
    let books = body.as_array().unwrap();
    let frankenstein = books.iter().find(|b| b["id"] == 2).unwrap();
    assert_eq!(frankenstein["synopsis"], Value::Null);
    assert_eq!(frankenstein["spineColor"], Value::Null);
    assert_eq!(frankenstein["pageCount"], Value::Null);
    assert_eq!(frankenstein["epubUrl"], "https://example.org/f.epub");
}

#[tokio::test]
async fn list_books_empty_catalog_returns_empty_array() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    // No seed_db call: migration alone must create an empty, valid table.
    server::db::migrate(&db_path).unwrap();

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/books")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn get_book_by_id_ok() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    seed_db(&db_path);

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/books/1")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["id"], 1);
    assert_eq!(body["title"], "Moby-Dick");
}

#[tokio::test]
async fn get_book_by_id_404_has_error_shape() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    seed_db(&db_path);

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/books/999")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::NOT_FOUND);
    let body = body_json(response).await;
    assert_eq!(body["error"]["code"], "not_found");
    assert!(body["error"]["message"].as_str().unwrap().contains("999"));
}

#[tokio::test]
async fn healthz_reports_book_count() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    seed_db(&db_path);

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/healthz")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["status"], "ok");
    assert_eq!(body["books"], 2);
}

#[tokio::test]
async fn migration_is_idempotent() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");

    server::db::migrate(&db_path).unwrap();
    server::db::migrate(&db_path).unwrap(); // must not error or reset data
    seed_db(&db_path);
    server::db::migrate(&db_path).unwrap(); // must not wipe existing rows

    let app = build_app(&db_path, dir.path(), None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/books")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = body_json(response).await;
    assert_eq!(body.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn list_books_truncates_to_max_books() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    server::db::migrate(&db_path).unwrap();

    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let over_cap = server::db::MAX_BOOKS + 5;
    let tx = conn.unchecked_transaction().unwrap();
    for i in 0..over_cap {
        tx.execute(
            "INSERT INTO books (id, title, author, epub_url) VALUES (?1, ?2, 'A', ?3)",
            rusqlite::params![i as i64, format!("Book {i}"), format!("/e{i}.epub")],
        )
        .unwrap();
    }
    tx.commit().unwrap();

    let books = server::db::list_books(&db_path).unwrap();
    assert_eq!(books.len(), server::db::MAX_BOOKS);
}

#[tokio::test]
async fn epub_served_with_correct_content_type_and_ranges() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    server::db::migrate(&db_path).unwrap();

    let epub_dir = dir.path().join("epubs");
    std::fs::create_dir_all(&epub_dir).unwrap();
    std::fs::write(epub_dir.join("moby-dick.epub"), b"fake epub bytes").unwrap();

    let app = build_app(&db_path, &epub_dir, None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/epubs/moby-dick.epub")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    assert_eq!(
        response.headers().get("content-type").unwrap(),
        "application/epub+zip"
    );
    assert_eq!(response.headers().get("accept-ranges").unwrap(), "bytes");
}

#[tokio::test]
async fn epub_missing_file_is_404() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("books.sqlite");
    server::db::migrate(&db_path).unwrap();
    let epub_dir = dir.path().join("epubs");
    std::fs::create_dir_all(&epub_dir).unwrap();

    let app = build_app(&db_path, &epub_dir, None);
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/epubs/does-not-exist.epub")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::NOT_FOUND);
}
