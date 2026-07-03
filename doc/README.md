# babelLibrary — Planning Documentation

A walkable, first-person 3D library in the browser. Books come from a SQLite catalog (title, author, synopsis, EPUB URL); clicking a book on a shelf opens the actual EPUB in an in-browser reader. Built with Rust (Axum server + WebAssembly layout generator) and Three.js.

These documents are the complete build plan. They complement the OpenSpec change at `openspec/changes/library-3d-environment/` (proposal, requirement specs, tasks); where the specs say *what* must be true, these docs say *how* to build it, in enough detail to start coding.

## Document index

| Doc | Contents |
|---|---|
| [01-overview.md](01-overview.md) | Vision, user experience walkthrough, goals/non-goals, glossary |
| [02-architecture.md](02-architecture.md) | System architecture, tech stack with pinned versions, repo layout, data flow |
| [03-data-and-api.md](03-data-and-api.md) | SQLite schema, seeding, HTTP API contract with JSON shapes, EPUB serving |
| [04-wasm-generator.md](04-wasm-generator.md) | `babel-gen` crate: world model, generation algorithm, wasm API, buffer layouts, determinism |
| [05-rendering.md](05-rendering.md) | Scene construction, assets, instancing, lighting, gallery streaming, performance budgets |
| [06-navigation-collision.md](06-navigation-collision.md) | Pointer-lock controls, movement model, capsule-vs-AABB collision with slide |
| [07-interaction-reader.md](07-interaction-reader.md) | Raycast targeting, HUD, foliate-js reader (vendored), input-mode state machine, failure handling |
| [08-build-deployment.md](08-build-deployment.md) | Toolchain, dev workflow, build scripts, Dockerfile, hosting, configuration |
| [09-testing.md](09-testing.md) | Test strategy per layer, spec-scenario → test mapping, manual QA checklist |
| [10-roadmap.md](10-roadmap.md) | Milestones M0–M6 mapped to `tasks.md`, exit criteria, risk gates |

## Reading order

- To understand the product: 01 → 02.
- To start implementing: 02 → 08 (get the skeleton running), then 03/04 (data + generator, buildable in parallel), then 05 → 06 → 07.
- Contracts that multiple docs depend on (API JSON shapes, wasm buffer layouts, shared constants) are defined once — in 03 and 04 — and referenced elsewhere. If a contract changes, change it there first.
