# procedural-generation (delta)

> Modifies the `procedural-generation` capability from `library-3d-environment`.
> Implementation: doc [04](../../../../../doc/04-wasm-generator.md).

## MODIFIED Requirements

### Requirement: Floor layout is a geometrically closed cycle

Each floor's galleries SHALL form a closed cycle on the hexagonal lattice:
consecutive galleries in the cycle (including the last→first loop-closing
pair) MUST occupy hex-adjacent cells, so every doorway — including the one
that closes the loop — is a real shared wall between physically adjacent
galleries. The previous open random-walk chain, whose endpoints could be
arbitrarily far apart in world space, is replaced.

#### Scenario: Loop closes on a shared wall
- **WHEN** a floor's gallery cycle is generated
- **THEN** the last gallery's cell is hex-adjacent to the first gallery's cell (their centers are exactly one hex step apart)

#### Scenario: Every step is hex-adjacent
- **WHEN** any two consecutive galleries in a floor's cycle are examined
- **THEN** their axial `(q, r)` coordinates differ by exactly one of the six hex-direction vectors

#### Scenario: Closure holds across seeds
- **WHEN** floor layouts are generated across many seeds and catalog sizes (property test)
- **THEN** every floor is a closed hex cycle (never an open chain), falling back to a known-closable shape if a seeded walk cannot close

### Requirement: Vestibule faces its real neighbor

Each gallery SHALL record the hex direction of its horizontal-neighbor edge,
and its vestibule opening SHALL be placed on the wall facing that direction
(not a fixed wall index). Two galleries connected by a shared doorway MUST
have their openings facing each other.

#### Scenario: Opening faces the neighbor
- **WHEN** a gallery has a horizontal neighbor via hex direction `d`
- **THEN** its vestibule opening is emitted on the wall for direction `d`, and the neighbor's opening is on the wall for the opposite direction

#### Scenario: Emitted graph exposes edge direction
- **WHEN** the generator emits its graph JSON
- **THEN** each gallery includes the hex-direction index of its horizontal-neighbor edge, so the frontend can orient anteroom/opening geometry without re-deriving it

### Requirement: Spawn pose emitted at floor level

The generator SHALL emit the spawn position at floor level (the player's feet
on the floor), leaving the frontend to add eye height. Eye height MUST NOT be
baked into generator-emitted world data.

#### Scenario: Spawn y is floor level
- **WHEN** the generator emits the spawn pose
- **THEN** its `y` is the gallery's floor height (no eye-height offset added in the generator)
