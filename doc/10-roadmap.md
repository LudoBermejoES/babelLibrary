# 10 — Roadmap & milestones

Milestones are cumulative and each ends in something demonstrable. Task numbers reference `openspec/changes/library-3d-environment/tasks.md`; run them with `/opsx:apply`.

## M0 — Walking skeleton + CI (tasks 1.1–1.6)

Everything talks to everything, with placeholder content: workspace + Vite app + a trivial wasm export called from TypeScript, blank Three.js scene, dev proxy wired — and the full CI pipeline (fmt, clippy, cargo test, tsc, vitest, build, Playwright) running from the first commit so the TDD discipline (doc 09 §0) is machine-enforced for everything that follows.

**Exit criteria**: `npm run dev` + `cargo run -p server` shows a rendered empty room; every test harness (cargo test ×2, vitest, Playwright) runs at least one passing test; CI is green and red-blocks merge; a wasm function's typed result asserted from a test.
**Risk retired**: the whole toolchain (wasm-pack ↔ Vite ↔ TS types) — the plan's least-forgiving integration — proven before any feature code.

## M1 — Catalog online (tasks 2.1–2.5)

Schema + migration, `/api/books(/{id})`, `/epubs` serving, Gutenberg seed script, server tests green.

**Exit criteria**: `curl /api/books` returns seeded books; an EPUB downloads with the right content type; `cargo test -p server` green.
**Parallelizable**: M1 and M2 are independent — build simultaneously if two workstreams exist.

## M2 — Generator complete (tasks 3.1–3.5)

Hex gallery graph, furnishing, book→slot assignment, buffer emission, wasm bindings + TS facade, native determinism suite green.

**Exit criteria**: `cargo test -p babel-gen` green (incl. connectivity + doorway clearance); facade returns sane buffer lengths for a fake 500-book catalog in a vitest run.

## M3 — The library appears (tasks 4.1–4.6)

Catalog → generator → rendered galleries: architecture, instanced shelves/books (placeholder boxes first, GLBs after 4.3), lighting, gallery streaming. Debug HUD (`?debug`).

**Exit criteria**: seeded catalog visible as a multi-gallery library; free camera (temporary) can inspect it; draw calls within budget on the debug HUD.
**Demo moment** — first time it looks like the product.

## M4 — It's walkable (tasks 5.1–5.4, then 4.7)

Pointer lock, movement, collision, gallery tracking + hysteresis, pause overlay. Then the M3+M4 perf pass (task 4.7) with 3k books.

**Exit criteria**: navigation specs' scenarios pass (vitest collision suite + Playwright `enter_and_walk`, `esc_pause`); perf walk ≥ 30 FPS floor, < 100 calls.

## M5 — Books open (tasks 6.1–6.6)

Raycast targeting, highlight + HUD with dwell synopsis, epub.js reader (loading/TOC/paging/error card), mode state machine, lazy-load guarantee.

**Exit criteria**: full Playwright suite green including `correct_book`, `broken_epub`, `lazy_epubs`. This closes every user-facing spec.

## M6 — Shipped (tasks 7.1–7.4)

Production wiring (server serves `dist/`), Dockerfile, deploy to Fly.io (or chosen host), README (toolchain, seed/dev/build/deploy, env vars), deploy verification checklist (doc 08), manual QA pass.

**Exit criteria**: public URL passes the doc 08 checklist in Chrome + Firefox; README fresh-machine run-through succeeds.

## Sequencing summary

```text
M0 ──▶ M1 ──┐
   └─▶ M2 ──┴─▶ M3 ──▶ M4 ──▶ M5 ──▶ M6
```

Estimated effort (focused solo work): M0 ~1 d · M1 ~1 d · M2 ~2–3 d · M3 ~2–3 d · M4 ~1–2 d · M5 ~2 d · M6 ~1 d ≈ **2 weeks**.

## Risk gates (stop-and-reassess points)

| After | Check | Fallback if failed |
|---|---|---|
| M0 | wasm↔Vite↔TS types work end-to-end | wasm-bindgen-cli direct (drop wasm-pack) |
| M3 | draw calls & FPS with placeholder assets | cut archetypes to 1, shrink neighbor set (levers in doc 05) |
| M4 | doorway feel — no snags in manual wandering | widen doorways to 1.4 m; if still bad, swap in `@dimforge/rapier3d-compat` character controller (doc 06 fallback) |
| M5 | external-EPUB CORS reality with real catalog URLs | server-side proxy endpoint for whitelisted hosts (follow-up change) |

## Deferred (explicitly not v1 — candidates for the next OpenSpec change)

Spine-title textures (canvas atlas) · baked lightmaps · reading-progress persistence · catalog search/teleport ("find me this book") · streaming/infinite galleries for 10k+ catalogs · mobile controls · WebGPU renderer · ambient audio.
