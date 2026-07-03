use std::path::Path;

use rusqlite::Connection;

pub const SCHEMA: &str = "
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS books (
        id          INTEGER PRIMARY KEY,
        title       TEXT    NOT NULL,
        author      TEXT    NOT NULL,
        synopsis    TEXT,
        epub_url    TEXT    NOT NULL UNIQUE,
        spine_color TEXT,
        page_count  INTEGER,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_books_author ON books(author, title);
";

/// Idempotent: safe to call on every server start, including against an
/// already-migrated database with existing rows.
pub fn migrate(path: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BookMeta {
    pub id: i64,
    pub title: String,
    pub author: String,
    pub synopsis: Option<String>,
    #[serde(rename = "epubUrl")]
    pub epub_url: String,
    #[serde(rename = "spineColor")]
    pub spine_color: Option<String>,
    #[serde(rename = "pageCount")]
    pub page_count: Option<i64>,
}

impl BookMeta {
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(BookMeta {
            id: row.get("id")?,
            title: row.get("title")?,
            author: row.get("author")?,
            synopsis: row.get("synopsis")?,
            epub_url: row.get("epub_url")?,
            spine_color: row.get("spine_color")?,
            page_count: row.get("page_count")?,
        })
    }
}

/// Response cap: guard against pathologically large catalogs (see design
/// risk on huge catalogs). Truncates rather than erroring.
pub const MAX_BOOKS: usize = 10_000;

const BOOK_COLUMNS: &str = "id, title, author, synopsis, epub_url, spine_color, page_count";

fn open_read_only(path: &Path) -> rusqlite::Result<Connection> {
    Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
}

pub fn list_books(path: &Path) -> rusqlite::Result<Vec<BookMeta>> {
    let conn = open_read_only(path)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {BOOK_COLUMNS} FROM books ORDER BY id ASC LIMIT ?1"
    ))?;
    let rows = stmt.query_map([MAX_BOOKS as i64], BookMeta::from_row)?;
    let books: Vec<BookMeta> = rows.collect::<rusqlite::Result<_>>()?;

    if books.len() == MAX_BOOKS {
        tracing::warn!(
            cap = MAX_BOOKS,
            "book catalog truncated to the response cap; some books were not returned"
        );
    }

    Ok(books)
}

pub fn get_book(path: &Path, id: i64) -> rusqlite::Result<Option<BookMeta>> {
    let conn = open_read_only(path)?;
    let mut stmt = conn.prepare(&format!("SELECT {BOOK_COLUMNS} FROM books WHERE id = ?1"))?;
    stmt.query_row([id], BookMeta::from_row)
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
}

pub fn count_books(path: &Path) -> rusqlite::Result<i64> {
    let conn = open_read_only(path)?;
    conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))
}
