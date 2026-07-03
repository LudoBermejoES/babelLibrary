#!/usr/bin/env bash
# Builds crates/babel-gen to wasm and drops the pkg into web/src/wasm/pkg.
#
# The wasm32-unknown-unknown target lives on a separate rustup-managed
# toolchain (installed via `brew install rustup`, kept keg-only so it does
# not shadow the Homebrew `rust` formula used for native cargo/rustc). This
# script prepends rustup's bin dir to PATH only for this invocation.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_FLAG=""
if [[ "${1:-}" == "--release" ]]; then
  PROFILE_FLAG="--release"
fi

export PATH="$HOME/.cargo/bin:/opt/homebrew/opt/rustup/bin:$PATH"

# The getrandom_backend cfg flag required for wasm32-unknown-unknown lives
# in .cargo/config.toml (applies to every build path, not just this script).

wasm-pack build "$REPO_ROOT/crates/babel-gen" \
  --target web \
  $PROFILE_FLAG \
  --out-dir "$REPO_ROOT/web/src/wasm/pkg" \
  --out-name babel-gen
