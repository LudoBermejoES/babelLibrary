#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$REPO_ROOT/scripts/wasm-build.sh" --release
(cd "$REPO_ROOT/web" && npx tsc --noEmit && npx vite build)
cargo build --release -p server

echo "Build complete: web/dist/ + target/release/server"
echo "Run: BABEL_STATIC_DIR=web/dist target/release/server"
