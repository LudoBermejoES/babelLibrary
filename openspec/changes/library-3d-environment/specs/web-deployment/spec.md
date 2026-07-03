# web-deployment

> Implementation details: [doc/08-build-deployment.md](../../../../../doc/08-build-deployment.md) (dev workflow, build scripts, Dockerfile, hosting, deploy verification checklist).

## ADDED Requirements

### Requirement: Single-command production build
The repository SHALL provide a single command that compiles the Rust wasm crate, builds the TypeScript/Vite frontend, and builds the Rust server binary, producing everything needed to run the application (server binary + static `dist/` + database path configuration).

#### Scenario: Clean build
- **WHEN** the build command is run on a clean checkout with the documented toolchain installed
- **THEN** it exits successfully and the server can be started immediately against the built assets and a seeded database

### Requirement: Rust server serves the whole application
The Rust (Axum) server SHALL serve, from one origin: the built frontend (SPA with fallback to `index.html` for unknown paths), the catalog API under `/api`, and locally hosted EPUB files — with correct content types, including `application/wasm` for wasm assets (so streaming compilation works), `model/gltf-binary` for `.glb`, and `application/epub+zip` for EPUBs.

#### Scenario: Visiting the deployed site
- **WHEN** a user opens the public URL in a current Chrome or Firefox
- **THEN** the library loads and is walkable, books show catalog data, EPUBs open, and there are no console errors about wasm loading or MIME types

### Requirement: Containerized deployment
The repository SHALL include a Dockerfile (multi-stage: wasm + frontend + server build, minimal runtime image) so the application deploys to any container host with the SQLite database and EPUB directory mounted or baked in, listening on a configurable port.

#### Scenario: Docker run
- **WHEN** the image is built and run with a database file and EPUB directory provided
- **THEN** the full application is reachable on the configured port and serves the seeded books

### Requirement: Local development workflow
The repository SHALL support a documented dev workflow: one command starts the Vite dev server (hot reload for TypeScript) proxying `/api` and `/epubs` to the locally running Rust server, and a documented command rebuilds the wasm module when Rust changes.

#### Scenario: Frontend iteration
- **WHEN** a developer edits a TypeScript file while the dev servers run
- **THEN** the browser reflects the change without a manual restart, and API calls keep working through the proxy

#### Scenario: Rust iteration
- **WHEN** a developer edits the wasm crate and runs the documented wasm rebuild command
- **THEN** the dev server picks up the new wasm module on next reload

### Requirement: Deployment documentation
The README SHALL document required toolchain versions (Node, Rust, wasm-pack, SQLite), build/dev/seed/deploy commands, and the environment variables/flags (database path, EPUB directory, port).

#### Scenario: New machine onboarding
- **WHEN** a developer follows the README on a machine with none of the toolchain installed
- **THEN** they can install prerequisites, seed the sample catalog, run the dev environment, and produce a deployable build without consulting anything outside the README
