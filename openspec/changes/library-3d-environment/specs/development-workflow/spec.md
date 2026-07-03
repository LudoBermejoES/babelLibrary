# development-workflow

> Implementation details: [doc/09-testing.md](../../../../../doc/09-testing.md) (TDD workflow, test types per layer, spec-scenario → test mapping, CI pipeline).

## ADDED Requirements

### Requirement: Test-driven development at every step
Every implementation task SHALL follow the TDD cycle: write a failing test that expresses the task's acceptance criteria first (red), write the minimal code to make it pass (green), then refactor with the tests staying green. No production behavior may be added or changed without a test that fails before the change and passes after it. A task in `tasks.md` MUST NOT be checked off while any test is failing.

#### Scenario: New behavior starts with a failing test
- **WHEN** an implementation task begins (e.g., "GET /api/books returns books ordered by id")
- **THEN** a test asserting that behavior exists and fails before the production code is written, and passes after

#### Scenario: Task completion requires green suite
- **WHEN** a task is marked complete in `tasks.md`
- **THEN** the full test suite for the affected layer passes at that commit

#### Scenario: Bug fixes start with a reproducing test
- **WHEN** a defect is found at any point
- **THEN** a test reproducing it is written and observed failing before the fix is applied

### Requirement: All test types are exercised
The project SHALL maintain, from the first milestone onward, every applicable test type per layer — unit, property-based, integration, end-to-end, performance, and static checks — as defined in [doc/09-testing.md](../../../../../doc/09-testing.md):

- **Rust unit + property tests** (`cargo test`, `proptest`): generator determinism, placement totality, geometry bounds, graph connectivity.
- **Rust integration tests** (Axum `oneshot` against fixture DBs): API contract, content types, error shapes.
- **Frontend unit tests** (vitest): collision math, frame-rate independence, dwell timer, API client parsing, wasm facade buffer shapes.
- **End-to-end tests** (Playwright, real server + real wasm + seeded fixture catalog): user-facing spec scenarios, console-error-free boot, lazy-loading guarantees, failure paths.
- **Performance tests** (scripted walk gate): FPS floor and draw-call budget assertions.
- **Static checks**: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `tsc --noEmit`.

#### Scenario: Each layer has its suite from the start
- **WHEN** a milestone introduces a new layer (server, generator, frontend logic, UI flows)
- **THEN** that layer's test suite exists in the same milestone with at least the tests covering its spec scenarios, not deferred to a later phase

#### Scenario: Spec scenarios are traceable to tests
- **WHEN** any requirement scenario in this change's specs is implemented
- **THEN** a named automated test (or, only where automation is impossible, a documented manual QA checklist item) covers it, per the mapping in doc 09

### Requirement: Continuous verification gates
A CI pipeline SHALL run on every pull request and block merge on failure, executing: static checks, Rust unit/property/integration tests, wasm build + frontend typecheck + vitest, the production build, and the Playwright suite. The performance gate runs on demand and before every release.

#### Scenario: Red pipeline blocks merge
- **WHEN** any test or static check fails on a pull request
- **THEN** the change cannot be merged until the pipeline is green

#### Scenario: Every merge is releasable
- **WHEN** a commit lands on the main branch
- **THEN** it has passed the full pipeline, so a production build from it is expected to work end-to-end
