# first-person-navigation

> Implementation details: [doc/06-navigation-collision.md](../../../../../doc/06-navigation-collision.md) (input-mode state machine, movement math, capsule-vs-AABB slide algorithm, tuning constants).

## ADDED Requirements

### Requirement: Pointer-lock first-person controls
The app SHALL provide first-person controls: clicking the scene engages pointer lock for mouse look; `WASD` (and arrow keys) move the player; `Esc` releases pointer lock and shows a pause/help overlay.

#### Scenario: Engaging controls
- **WHEN** the user clicks the rendered scene
- **THEN** pointer lock engages, the cursor disappears, and mouse movement rotates the camera

#### Scenario: Releasing controls
- **WHEN** the user presses `Esc` while in pointer lock
- **THEN** pointer lock releases and an overlay with control instructions is shown

### Requirement: Movement tuned for walking
Player movement SHALL feel like walking: fixed eye height (~1.7 m), configurable walk speed (default ~3 m/s), frame-rate-independent motion (delta-time based), and no flying or vertical movement input.

#### Scenario: Frame-rate independence
- **WHEN** the same forward input is held for 2 seconds at 30 FPS and at 120 FPS
- **THEN** the player travels the same distance in both cases (within 5%)

### Requirement: Collision with walls and furniture
The player SHALL NOT be able to pass through walls, shelves, or furniture. Collision response MUST slide along surfaces rather than stopping dead, and the player MUST always pass through doorways at least 0.9 m wide.

#### Scenario: Blocked by a wall
- **WHEN** the player walks directly into a wall
- **THEN** forward progress stops but lateral sliding along the wall still works

#### Scenario: Passing a doorway
- **WHEN** the player walks through a gallery doorway
- **THEN** they pass through without snagging on the door frame

### Requirement: Traversal between galleries
The player SHALL be able to walk from any gallery into each of its connected neighbor galleries, with neighbor content loaded/generated before it is reachable so traversal is seamless.

#### Scenario: Seamless gallery transition
- **WHEN** the player crosses a doorway into a neighboring gallery
- **THEN** the neighbor's shelves and books are already present (no pop-in of the room the player is entering) and controls remain responsive
