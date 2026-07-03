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
Player movement SHALL feel like walking: fixed eye height (~1.7 m), configurable walk speed (default ~3 m/s), frame-rate-independent motion (delta-time based), and no flying, jumping, or direct vertical movement input — the only way the player's elevation changes is by walking along a spiral staircase (see Vertical traversal).

#### Scenario: Frame-rate independence
- **WHEN** the same forward input is held for 2 seconds at 30 FPS and at 120 FPS
- **THEN** the player travels the same distance in both cases (within 5%)

### Requirement: Collision with walls and furniture
The player SHALL NOT be able to pass through walls, shelves, or furniture. Collision response MUST slide along surfaces rather than stopping dead, and the player MUST always pass through vestibule openings at least 0.9 m wide.

#### Scenario: Blocked by a wall
- **WHEN** the player walks directly into a wall
- **THEN** forward progress stops but lateral sliding along the wall still works

#### Scenario: Passing a vestibule opening
- **WHEN** the player walks through a gallery's vestibule opening
- **THEN** they pass through without snagging on the door frame

### Requirement: Traversal between galleries
The player SHALL be able to walk from any gallery into its horizontally connected neighbor gallery (through the vestibule), with neighbor content loaded/generated before it is reachable so traversal is seamless.

#### Scenario: Seamless gallery transition
- **WHEN** the player crosses a vestibule opening into a neighboring gallery
- **THEN** the neighbor's shelves and books are already present (no pop-in of the room the player is entering) and controls remain responsive

### Requirement: Vertical traversal via spiral staircase
Where a gallery's vestibule contains a spiral staircase (because a gallery exists on the floor above and/or below at the same horizontal position), the player SHALL be able to walk up and/or down it using the same WASD movement input, with no separate "climb" control. Elevation change follows the staircase's fixed geometry (one full turn per floor), and the destination floor's content MUST be loaded before the player arrives, matching the seamlessness of horizontal traversal.

#### Scenario: Climbing a staircase
- **WHEN** the player walks onto a staircase with a floor-above connection and continues walking forward along it
- **THEN** the player's elevation increases smoothly, following the staircase's helical path, until they reach the floor-above landing

#### Scenario: Descending a staircase
- **WHEN** the player walks onto a staircase with a floor-below connection and continues walking forward along it
- **THEN** the player's elevation decreases smoothly along the same helical path until they reach the floor-below landing

#### Scenario: No staircase where no floor neighbor exists
- **WHEN** a gallery has no floor-above and no floor-below counterpart in the generated layout
- **THEN** its vestibule contains no staircase, and the player cannot change elevation from that gallery

#### Scenario: Seamless floor transition
- **WHEN** the player reaches the top or bottom of a staircase and enters the new floor's gallery
- **THEN** that gallery's shelves and books are already present (no pop-in) and controls remain responsive
