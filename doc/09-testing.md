# 09 — Testing plan

Strategy: push logic to where it's cheaply testable (Rust native tests for the generator, Rust integration tests for the server), keep the browser layer thin and cover it with a small Playwright suite + a manual checklist. Every spec scenario in `openspec/changes/library-3d-environment/specs/` maps to at least one row below.

## 0. TDD workflow (mandatory — see the `development-workflow` spec)

Every task in `tasks.md` follows red → green → refactor:

1. **Red** — write the test(s) expressing the task's acceptance criteria first, run them, watch them fail. The failing run proves the test can fail (a test that passes before the code exists tests nothing).
2. **Green** — write the minimal implementation to pass. Resist implementing ahead of the tests.
3. **Refactor** — clean up with the suite green; static checks (`cargo clippy --workspace --all-targets -- -D warnings`, `tsc --noEmit`) count as part of green.

Rules of engagement:

- No production behavior lands without a test that failed before it. Bug fixes start with a reproducing test.
- A `tasks.md` checkbox may only be ticked with the affected layer's full suite passing at that commit.
- CI exists from milestone M0 (task 1.5) so the discipline is enforced by machinery, not memory — red blocks merge from the very first commit.
- Test placement follows the architecture: logic is deliberately kept pure/target-independent (generator math in plain Rust, collision/dwell in pure TS functions) precisely so the fast suites — `cargo test`, vitest — can lead development; Playwright covers what only a browser can observe.
- Exploratory work (asset look, lighting feel) is the one sanctioned exception to test-first: explore freely, then write the acceptance test the moment the result settles — before the task is checked off.
- Suites below are ordered by feedback speed; run the fastest suite that can catch your mistake, run everything before pushing.

## 1. Generator — `cargo test -p babel-gen` (native, no wasm)

Full list in doc 04. Spec coverage:

| Test | Spec scenario |
|---|---|
| `same_inputs_same_layout` | procedural-generation / Same inputs produce same library |
| `all_books_placed_once` | Library sized to catalog · Every book is placed and renderable |
| `different_seeds_differ` | Different seeds differ (from original spec intent) |
| `catalog_hint_wins` | Catalog hint wins |
| `spine_bounds` | Every book placed and renderable (dimension bounds) |
| `fixed_hexagon_shape`, `shelf_capacity_is_160` | Fixed hexagon shape · Capacity is fixed, not derived |
| `graph_connected`, `floors_align_vertically`, `floor_fills_before_next_floor_starts` | Every gallery is reachable · Additional floors start only after a floor fills |
| `doorway_clearance`, `min_galleries` | navigation traversal + vestibule-opening specs (data-side guarantee) |

Plus a `proptest` property test (seed × catalog-size fuzz): placement is total, unique, in-bounds.

## 2. Server — `cargo test -p server` (Axum + `tower::ServiceExt::oneshot`, fixture DB per test in tmpdir)

| Test | Spec scenario |
|---|---|
| `list_books_ordered` — 3 rows inserted out of order → response ordered by id, camelCase fields | book-catalog / Listing books |
| `get_book_ok` / `get_book_404` — JSON error shape on unknown id | Fetching one book |
| `optional_fields_null` — row without spine_color/page_count → nulls | Missing optional fields |
| `epub_served` — `.epub` fixture → 200, `application/epub+zip`, `accept-ranges: bytes` | Locally hosted EPUB |
| `external_url_passthrough` — absolute URL row returned verbatim | External EPUB |
| `wasm_mime` — static dir with a `.wasm` file → `application/wasm` | web-deployment / Visiting the deployed site |
| `spa_fallback` — unknown path → index.html | (design) |
| `healthz_counts` | (deploy checklist) |

## 3. Frontend unit — `vitest` (no browser, no three rendering)

- **Collision math** (pure functions in `controls/collide.ts`): wall block + slide (velocity tangential component preserved), 1.2 m vestibule-opening pass at multiple approach angles, deep-penetration fallback, `dt` cap. Spec: Blocked by a wall · Passing a vestibule opening.
- **Staircase helix math** (pure functions in `controls/stairs.ts`): entering/exiting the helix footprint toggles `verticalMode`; forward movement along the helix advances `position.y` at the fixed rise-per-turn rate; reaching either end lands exactly at the adjoining floor's height. Spec: Climbing a staircase · Descending a staircase · No staircase where no floor neighbor exists.
- **Frame-rate independence**: simulate 2 s of held forward at dt=1/30 vs dt=1/120 → distance within 5%. Spec: Frame-rate independence.
- **API client**: zod-parse of good/bad payloads; timeout/retry behavior with a mocked fetch.
- **Dwell timer**: same-book instanceId flicker doesn't reset; book change does. Spec: Dwelling on a book.
- **Wasm facade** (runs the real wasm in Node via vitest): buffers have expected strides/lengths for a 100-book catalog (incl. the fixed-size `vestibule` record and `shaft_colliders`); `bookIds` aligns with transforms count; `tsc --noEmit` (separate CI step) guards the no-`any`-boundary spec.

## 4. End-to-end — Playwright (chromium; real server + seeded fixture catalog + real wasm)

Runs against `scripts/e2e-env.sh` (release server, tiny 40-book fixture with 1 external-URL row and 1 broken row).

| Test | What it does | Spec scenarios |
|---|---|---|
| `boots_clean` | load page → enter overlay visible; **fail on any console error** | web-deployment / Visiting site |
| `enter_and_walk` | click → pointer locked; synthetic WASD → camera position changes | Engaging controls |
| `esc_pause` | Esc → overlay with instructions | Releasing controls |
| `hud_metadata` | teleport (debug hook) in front of a shelf, aim at a spine → HUD shows title/author; wait 0.6 s → synopsis | Looking at a nearby book · Dwelling |
| `open_epub` | click targeted book → overlay, loading, then rendered epub iframe; arrow key pages; TOC jump | Opening a book · Paging and chapters |
| `close_restores_pose` | record camera pose → open → Esc → pose identical | Closing a book |
| `correct_book` | debug hook exposes targeted bookId → open → reader header title matches that id's catalog title | Correct book identity |
| `broken_epub` | target the broken row → error card with title; close → still walkable | Broken EPUB URL |
| `lazy_epubs` | scripted 20 s walk, no clicks → **zero** requests to `/epubs/` or external hosts (route interception) | No content precomputation |
| `webgl_missing` | launch with `--disable-webgl` flags → error panel, no blank canvas | WebGL unavailable |
| `climb_stairs` | teleport onto a known staircase footprint, walk forward → elevation increases smoothly, lands on the floor-above gallery, its content already present | Climbing a staircase · Seamless floor transition |
| `shaft_glimpse` | teleport to a gallery with a generated floor-below counterpart, look down the shaft → that gallery's geometry visible through the opening | Looking down the shaft |

Debug hooks (dev/e2e builds only, behind `?e2e`): `window.__babel = { teleport(q,r,floor,x,y,z,yaw), targetedBookId, stats: {fps30sMin, drawCalls} }` — teleport now addresses a specific `(q, r, floor)` gallery plus a local offset, since position alone no longer determines which gallery (and floor) the player is in.

## 5. Performance gate — semi-automated

Playwright `perf_walk` (tagged `@perf`, run on demand, not per-commit): 3,000-book seeded catalog, scripted 60 s walk crossing 3 galleries via teleport-waypoints + keyboard, then read `window.__babel.stats` → assert `fps30sMin ≥ 30` and `drawCalls < 100`. Machine-dependent — the CI assertion is a smoke bound (≥ 20 on CI runners), the real ≥ 30 check is a release-checklist item on reference hardware. Spec: Walking through galleries · Draw call budget.

## 6. Manual QA checklist (release)

- Feel: walk speed, mouse sensitivity, no vestibule-opening snags in 5 minutes of wandering (all 6 hex wall orientations); staircase climbing/descending feels natural, not disorienting.
- Visual: no z-fighting, no light pops on gallery swap, fog looks right through vestibule openings and the shaft; the mirror reads as a mirror, not a flat gray plane.
- Reader: a long real EPUB (Moby-Dick) — TOC, 20+ page turns, resize mid-read, reopen.
- External EPUB row on the deployed site (CORS reality check).
- Fresh-machine README run-through (spec: New machine onboarding) — performed once per release by following README.md literally in a clean container/VM.

## CI pipeline (GitHub Actions)

Two workflows, deliberately separate — `.github/workflows/ci.yml` runs on every PR and push to `main`; `.github/workflows/release.yml` runs **only on an explicit human action** (a manual `workflow_dispatch` run, or publishing a GitHub Release), never automatically from a commit, push, or tag. This is a deliberate cost control: routine commits — including the version-bump-and-tag step described in `CLAUDE.md` — never trigger a Docker build or registry push on their own.

**`ci.yml` (every PR / push to `main`):**

1. `cargo fmt --all --check` + `cargo clippy --workspace --all-targets -- -D warnings`
2. `cargo test --workspace` (babel-gen + server)
3. wasm build (`scripts/wasm-build.sh --release`), uploaded as an artifact for the frontend/e2e jobs
4. `tsc` + `vitest run` (`npm test` in `web/`)
5. `npm run build` (production build must succeed)
6. Playwright suite (chromium headless) against the dev server

**`release.yml` (manual `workflow_dispatch`, or a published GitHub Release):**

1. `docker build` (multi-stage, doc 08) and push to GHCR, tagged from the release version
