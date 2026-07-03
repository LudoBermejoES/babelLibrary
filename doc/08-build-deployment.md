# 08 — Build, dev workflow & deployment

## Toolchain prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | stable (pinned in `rust-toolchain.toml`) + `wasm32-unknown-unknown` target | rustup |
| wasm-pack | 0.15.x | `cargo install wasm-pack --locked` |
| Node.js | 22 LTS | nvm/brew |
| gltf-transform CLI | 4.4.x | dev-dependency of `web/` (`npx gltf-transform`) |
| Docker | any recent | deployment only |

## Dev workflow (two terminals)

```bash
# 1. one-time
npm --prefix web install
npm run seed                    # scripts/seed.ts → data/books.sqlite + data/epubs/

# 2. terminal A — server (API + epubs) on :8080
cargo run -p server             # reads BABEL_DB / BABEL_EPUB_DIR defaults

# 3. terminal B — frontend with HMR on :5173
npm run dev                     # vite; proxies /api and /epubs → :8080
```

- `vite.config.ts`: `server.proxy = { '/api': 'http://localhost:8080', '/epubs': 'http://localhost:8080' }`; plugins `[wasm()]`; `build.target: 'esnext'` (avoids the top-level-await plugin).
- **Rust wasm iteration**: `npm run wasm` → `wasm-pack build crates/babel-gen --target web --out-dir ../../web/src/wasm/pkg` (dev profile: `--dev` for fast builds). Vite picks the new pkg up on reload. Optional nicety later: `cargo watch -s 'npm run wasm'`.
- **Server iteration**: plain `cargo run`; `cargo watch -x 'run -p server'` optional.
- TypeScript checking is part of `npm run build` (`tsc --noEmit && vite build`) and the pre-commit expectation.

### npm scripts (root `package.json` delegating to `web/`)

| Script | Does |
|---|---|
| `dev` | vite dev server |
| `wasm` | wasm-pack build (dev profile) |
| `wasm:release` | wasm-pack build --release (runs wasm-opt) |
| `seed` | node scripts/seed.ts |
| `assets` | gltf-transform optimize over `web/assets-src/` → `web/public/assets/` |
| `build` | full production build (below) |
| `preview` | serve the production bundle via the release server locally |

## Production build

`npm run build` = `scripts/build.sh`:

```bash
set -euo pipefail
npm run wasm:release                       # 1. wasm (wasm-opt -O via wasm-pack)
(cd web && npx tsc --noEmit && npx vite build)   # 2. typecheck + bundle → web/dist
cargo build --release -p server            # 3. server binary
echo "Run: BABEL_STATIC_DIR=web/dist target/release/server"
```

Output: `target/release/server` + `web/dist/` + externally provided `data/`. Vite hashes `.wasm` and asset filenames (cache busting); the server sets `application/wasm` so streaming compilation works. No COOP/COEP headers needed (single-threaded wasm, no SharedArrayBuffer) — keep it that way.

## Dockerfile (multi-stage)

```dockerfile
# ---- stage 1: rust (server + wasm) ----
FROM rust:1-slim AS rust-build
RUN cargo install wasm-pack --locked
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
COPY server ./server
RUN wasm-pack build crates/babel-gen --target web --release --out-dir /app/wasm-pkg
RUN cargo build --release -p server

# ---- stage 2: frontend ----
FROM node:22-slim AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
COPY --from=rust-build /app/wasm-pkg ./src/wasm/pkg
RUN npx tsc --noEmit && npx vite build

# ---- stage 3: runtime ----
FROM debian:bookworm-slim
COPY --from=rust-build /app/target/release/server /usr/local/bin/server
COPY --from=web-build /app/web/dist /srv/dist
ENV BABEL_STATIC_DIR=/srv/dist BABEL_DB=/data/books.sqlite BABEL_EPUB_DIR=/data/epubs PORT=8080
EXPOSE 8080
HEALTHCHECK CMD ["/usr/local/bin/server", "--health-check"]   # or curl /healthz
VOLUME /data
ENTRYPOINT ["/usr/local/bin/server"]
```

Run: `docker run -p 8080:8080 -v $(pwd)/data:/data babel-library`. The catalog and EPUBs are runtime state, mounted — image rebuilds are code-only.

(Layer-caching refinement — `cargo chef` or dummy-main trick for dependency caching — is a nice-to-have once the file exists and is proven correct.)

## Hosting

- **Primary: Fly.io** (or any container host — Railway, a VPS with Docker + Caddy). Fly gives: Dockerfile-native deploys, a persistent volume for `/data`, automatic HTTPS. `fly launch` → `fly volumes create data` → mount in `fly.toml` → `fly deploy`; seed by `fly ssh console` + running the seed script, or `fly sftp` the prepared `data/` up.
- TLS is the platform's job (Fly proxy / Caddy); the Axum server speaks plain HTTP on `PORT`.
- **Fallback documented but not built**: static-only mode (bake `/api/books` to `books.json` at build time, host `dist/` + epubs on Cloudflare Pages). The frontend keeps this possible by isolating fetches in `web/src/api/`.

## Deploy verification checklist (spec scenarios)

1. Open the public URL in current Chrome and Firefox: library renders, no console errors (specifically none about wasm MIME or EPUB content types).
2. `curl -sI https://<url>/api/books | grep content-type` → JSON; `curl -sI .../epubs/<sample>.epub` → `application/epub+zip`, `accept-ranges: bytes`.
3. Walk, cross two galleries, open a local-EPUB book and an external-URL book, trigger the broken row (`--with-broken` seed) → error card, session survives.
4. `/healthz` returns book count; container restart → site recovers with data intact (volume).
