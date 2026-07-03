# 03 — Data model & API contract

This document is the canonical definition of the SQLite schema and the HTTP API. Other docs reference these shapes; change them here first.

## SQLite schema

File: `data/books.sqlite` (path from `BABEL_DB`). Created/updated by an idempotent migration run at server start (`CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version` gating).

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY,           -- stable; ordering + placement key
    title       TEXT    NOT NULL,
    author      TEXT    NOT NULL,
    synopsis    TEXT,                          -- nullable
    epub_url    TEXT    NOT NULL,              -- '/epubs/<file>.epub' or absolute http(s) URL
    spine_color TEXT,                          -- optional '#RRGGBB' hint; null → derived from id
    page_count  INTEGER,                       -- optional, informational
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_books_author ON books(author, title);
```

Conventions:

- **`epub_url`** — two forms only. Server-relative (`/epubs/moby-dick.epub`): the file must exist in `BABEL_EPUB_DIR`; served by us. Absolute (`https://…`): passed through untouched; the remote host's CORS policy applies (see doc 07).
- **`spine_color`** — `#RRGGBB`. Invalid values are treated as null (logged, not fatal).
- Deleting/inserting rows changes the layout (placement is a function of the catalog) — acceptable in v1.
- The server opens the DB **read-only** (`SQLITE_OPEN_READ_ONLY`) after migration. Catalog edits happen with any external SQLite tool. The server re-reads per request (no cache) — SQLite is more than fast enough at this scale, and it means catalog edits appear on next page load without a restart.

## HTTP API

All responses `application/json; charset=utf-8`. Errors use one shape:

```json
{ "error": { "code": "not_found", "message": "book 999 does not exist" } }
```

### `GET /api/books`

Returns every book, **ordered by `id` ascending** (stable order is part of the contract — determinism depends on it).

```json
[
  {
    "id": 1,
    "title": "Moby-Dick; or, The Whale",
    "author": "Herman Melville",
    "synopsis": "The voyage of the whaling ship Pequod...",
    "epubUrl": "/epubs/moby-dick.epub",
    "spineColor": "#1F3A5F",
    "pageCount": 635
  },
  {
    "id": 2,
    "title": "Frankenstein",
    "author": "Mary Shelley",
    "synopsis": null,
    "epubUrl": "https://www.gutenberg.org/ebooks/84.epub3.images",
    "spineColor": null,
    "pageCount": null
  }
]
```

- `200` always (empty array for an empty catalog).
- Response cap: if the catalog exceeds `10_000` rows, return the first 10k and log a warning (v1 guard; see design risk on huge catalogs).

### `GET /api/books/{id}`

- `200` with a single object (same shape).
- `404` with the error shape for unknown ids.

### `GET /epubs/{file}`

Static file serving from `BABEL_EPUB_DIR` via `tower-http::ServeDir`:

- `Content-Type: application/epub+zip` (explicit mapping for `.epub`).
- `Accept-Ranges: bytes` (ServeDir provides range support; beneficial for large EPUB files).
- No directory traversal (ServeDir normalizes), no listing.

### `GET /healthz`

`200 {"status":"ok","books":<count>}` — used by Docker healthcheck and deploy smoke tests.

### Static frontend (production)

Everything not matching the above is served from `BABEL_STATIC_DIR` with SPA fallback to `index.html`. Explicit MIME mappings: `.wasm → application/wasm` (streaming compilation), `.glb → model/gltf-binary`.

## TypeScript client contract

`web/src/api/types.ts` (hand-written, mirrors the wire format; a `zod` schema validates at the boundary in dev builds):

```ts
export interface BookMeta {
  id: number;
  title: string;
  author: string;
  synopsis: string | null;
  epubUrl: string;
  spineColor: string | null;  // '#RRGGBB'
  pageCount: number | null;
}
```

`web/src/api/client.ts` exposes `fetchBooks(): Promise<BookMeta[]>` with: 10 s timeout, one retry, and a thrown typed error that `main.ts` converts into the blocking error overlay (with a retry button). An empty array renders the "library is empty" screen naming the seed script.

## Server implementation notes (Axum)

- Crate deps: `axum`, `tokio` (rt-multi-thread), `tower-http` (fs, trace, compression), `rusqlite` (feature `bundled`), `serde`/`serde_json`, `clap` (env+flag config), `tracing-subscriber`.
- Connection handling: a small `r2d2`-style pool is overkill; use one `rusqlite::Connection` behind a `tokio::sync::Mutex`, or `spawn_blocking` per query. At v1 scale (two endpoints, small rows) either is fine; prefer `spawn_blocking` + a fresh read-only connection per request for zero lock contention.
- Row → JSON mapping lives in one `From<Row> for BookMeta` impl; camelCase via serde rename.
- CORS: none needed in production (single origin). In dev, Vite proxies `/api` and `/epubs`, so also none. Do not add a permissive CORS layer.
- Logging: `tracing` with request spans; log slow queries > 50 ms.

## Seeding

`scripts/seed.ts` (run with `node --experimental-strip-types` or `tsx`; alternatively a `cargo xtask` — decide at implementation, the contract is the output):

1. Ensures `data/epubs/` exists.
2. Downloads ~8 public-domain EPUBs from Project Gutenberg (fixed URL list checked into the script: Moby-Dick, Frankenstein, Pride and Prejudice, Dracula, The Time Machine, Alice in Wonderland, The Odyssey, Metamorphosis).
3. Creates/overwrites `data/books.sqlite` with the schema above and one row per file (title/author/synopsis hard-coded in the script; synopsis 1–2 sentences).
4. Adds **one deliberately broken row** (`/epubs/does-not-exist.epub`) guarded behind `--with-broken`, used by the reader failure test (doc 09).
5. Idempotent: safe to re-run; skips downloads that already exist.

`data/` is gitignored except `data/.gitkeep`; the seed script is the reproducible path to content. Gutenberg files are public domain — note the source URL per row in a `source_url` comment column if desired (not required v1).
