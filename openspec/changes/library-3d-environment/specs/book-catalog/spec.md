# book-catalog

> Implementation details: [doc/03-data-and-api.md](../../../../../doc/03-data-and-api.md) (canonical schema DDL, endpoint JSON shapes, seeding).

## ADDED Requirements

### Requirement: SQLite catalog schema
The system SHALL store the book catalog in a SQLite database with, at minimum, per book: a stable id, title, author, synopsis, the URL of the book's EPUB file, and optional presentation hints (spine color, page count). The database file location MUST be configurable (CLI flag or environment variable). The canonical DDL is defined in [doc/03-data-and-api.md](../../../../../doc/03-data-and-api.md).

#### Scenario: Catalog with required fields
- **WHEN** the server starts against a SQLite file containing books with title, author, synopsis, and EPUB URL
- **THEN** all books are available through the catalog API with those fields populated

#### Scenario: Missing optional fields
- **WHEN** a book row has no spine color or page count
- **THEN** the API returns the book with defaults/nulls for those fields and the frontend renders it with generated presentation values

### Requirement: Catalog API
A Rust server SHALL expose the catalog over HTTP as JSON: a list endpoint returning all books' metadata (id, title, author, synopsis, EPUB URL, hints) and a single-book endpoint by id. Responses MUST be stable-ordered (by id) so the 3D placement derived from them is deterministic. Errors MUST use a single JSON error shape. Catalogs larger than 10,000 rows are truncated to the first 10,000 with a logged warning.

#### Scenario: Listing books
- **WHEN** the frontend requests `GET /api/books`
- **THEN** it receives a JSON array of all catalog books ordered by id, each including title, author, synopsis, and EPUB URL

#### Scenario: Fetching one book
- **WHEN** the frontend requests `GET /api/books/{id}` with a valid id
- **THEN** it receives that book's full metadata, and a 404 with a JSON error body for an unknown id

#### Scenario: Catalog edits visible without restart
- **WHEN** a book row is added to the SQLite file with an external tool while the server is running
- **THEN** the next `GET /api/books` includes the new book (the server reads per request; the DB is opened read-only)

### Requirement: EPUB file serving
EPUB URLs in the catalog SHALL resolve for the browser: URLs pointing to files managed by this project MUST be served by the Rust server (correct `application/epub+zip` content type and HTTP range support), and absolute external URLs MUST be passed through untouched.

#### Scenario: Locally hosted EPUB
- **WHEN** a catalog row's EPUB URL is a server-relative path (e.g., `/epubs/moby-dick.epub`)
- **THEN** the server serves that file with content type `application/epub+zip`

#### Scenario: External EPUB
- **WHEN** a catalog row's EPUB URL is absolute (e.g., `https://example.org/book.epub`)
- **THEN** the API returns the URL unmodified for the frontend to load directly

### Requirement: Health endpoint
The server SHALL expose `GET /healthz` returning HTTP 200 with a JSON body containing the current book count, usable as a container healthcheck and deploy smoke test.

#### Scenario: Health check
- **WHEN** `GET /healthz` is requested on a healthy server with a seeded catalog
- **THEN** it returns 200 with `{"status":"ok","books":<count>}`

### Requirement: Seed data tooling
The repository SHALL include a documented way to create and populate the database (idempotent migration plus a seed script), and a sample catalog of public-domain EPUBs (Project Gutenberg) so the app runs end-to-end on a fresh checkout. The seed script MUST support a `--with-broken` flag that adds one row with a dead EPUB URL, used to exercise the reader's failure handling.

#### Scenario: Fresh checkout bootstrap
- **WHEN** a developer follows the documented seeding steps on a clean checkout
- **THEN** a SQLite database with sample books (and working EPUB URLs) exists and the app shows those books on the shelves

#### Scenario: Broken test row
- **WHEN** the seed script runs with `--with-broken`
- **THEN** the catalog contains one book whose EPUB URL points to a non-existent file
