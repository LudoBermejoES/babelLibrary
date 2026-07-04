# first-person-navigation (delta)

> Modifies the `first-person-navigation` capability from
> `library-3d-environment`. Implementation: doc
> [06](../../../../../doc/06-navigation-collision.md).

## MODIFIED Requirements

### Requirement: Movement tuned for walking

Player movement SHALL feel like walking: fixed eye height (~1.7 m),
configurable walk speed (default ~3 m/s), frame-rate-independent motion, and
no flying/jumping. Strafe MUST move the player toward the camera's actual
right/left (D right, A left); the camera-relative-to-world mapping is a pure,
unit-tested function.

#### Scenario: Frame-rate independence
- **WHEN** the same forward input is held for 2 seconds at 30 FPS and at 120 FPS
- **THEN** the player travels the same distance in both cases (within 5%)

#### Scenario: Strafe moves toward the camera's right
- **WHEN** the player holds the strafe-right (D) key
- **THEN** they move toward the camera's right-hand side (and strafe-left/A toward the left), at every camera yaw

### Requirement: Collision with walls and furniture

The player SHALL NOT pass through walls, shelves, or furniture, sliding along
surfaces rather than stopping dead. Collision MUST resolve against the union
of the current gallery and its live horizontal-neighbor galleries' AABBs, so
a player in the gallery-tracking hysteresis band cannot clip through the
neighbor's geometry before tracking flips.

#### Scenario: Blocked by a wall
- **WHEN** the player walks directly into a wall
- **THEN** forward progress stops but lateral sliding along the wall still works

#### Scenario: Neighbor walls are solid in the boundary band
- **WHEN** the player is within the gallery-tracking hysteresis band near a vestibule crossing, still tracked to the old gallery, and pushes toward the neighbor's facing wall
- **THEN** the neighbor's wall AABB blocks them (it is in the active collider set), rather than letting them clip through

### Requirement: Traversal between galleries

The player SHALL be able to walk from any gallery into its horizontally
connected neighbor and back again through the same doorway. Horizontal
adjacency MUST be treated as bidirectional for both gallery tracking and
streaming, even though the generator stores a one-way ring edge, so walking
back the way you came re-tracks to the previous gallery (which stays live)
rather than entering disposed, collider-free space.

#### Scenario: Seamless gallery transition
- **WHEN** the player crosses a vestibule opening into a neighboring gallery
- **THEN** the neighbor's shelves and books are already present (no pop-in) and controls remain responsive

#### Scenario: Walking back through the same doorway
- **WHEN** the player crosses from gallery A into gallery B, then turns around and walks back toward A
- **THEN** tracking re-selects A, whose geometry and colliders are still present (A was never disposed while adjacent), and the player re-enters a fully rendered gallery

### Requirement: Vertical traversal via spiral staircase

Where a gallery's vestibule contains a staircase, the player SHALL walk up
and/or down it with the same WASD input. The staircase's walkable helix band
MUST be defined in terms of the player's eye height (so entering at eye level
engages the stairs and reaching a landing lands at the next floor's eye
height, which gallery tracking then recognizes as a floor change), and the
player MUST be able to step off the staircase radially onto the flat floor
rather than being trapped orbiting it.

#### Scenario: Climbing a staircase changes floor
- **WHEN** the player walks onto an up-staircase at eye height and continues forward
- **THEN** elevation increases along the helix and, on reaching the top landing's eye height, gallery tracking switches to the floor-above gallery

#### Scenario: Descending a staircase is enterable
- **WHEN** the player stands at eye height in a gallery whose vestibule has a down-staircase and walks onto it
- **THEN** stairs mode engages (the band is defined at eye height, not floor level) and elevation decreases

#### Scenario: Stepping off the staircase
- **WHEN** the player moves radially (strafes) off the staircase footprint
- **THEN** they return to flat walking at their current height without being snapped or trapped in an endless orbit

## ADDED Requirements

### Requirement: Boot failures degrade gracefully

The app SHALL show a human-readable error panel instead of a silent black
canvas when startup fails after the canvas exists (the catalog fetch or the
wasm generator init throwing), matching the WebGL2-missing degradation.

#### Scenario: Catalog fetch fails
- **WHEN** the catalog request returns an error status (e.g. server up but DB unseeded) or the wasm module fails to load
- **THEN** an error panel explaining the failure is shown, not a blank/black canvas
