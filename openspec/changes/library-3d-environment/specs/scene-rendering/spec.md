# scene-rendering

> Implementation details: [doc/05-rendering.md](../../../../../doc/05-rendering.md) (renderer setup, instancing strategy, draw-call budget math, lighting, gallery streaming, perf levers) and [doc/01-overview.md](../../../../../doc/01-overview.md) (canonical constants).

## ADDED Requirements

### Requirement: Library scene rendered from generated data
The frontend SHALL build the Three.js scene exclusively from the layout data produced by the procedural-generation module: gallery geometry (floors, walls, ceilings, doorways), shelves, tables, and books. No library structure may be hard-coded in JavaScript.

#### Scenario: Scene reflects generator output
- **WHEN** the app starts with a given seed
- **THEN** the rendered galleries, shelf positions, and book placements match the generator's layout data for that seed

### Requirement: Instanced rendering for books
Books SHALL be rendered with instanced meshes (`InstancedMesh` or equivalent), with per-instance transform and color, so that thousands of visible books do not create thousands of draw calls.

#### Scenario: Draw call budget
- **WHEN** a gallery with at least 2,000 books is in view
- **THEN** all book spines render via instancing and the total scene draw calls remain under 100

### Requirement: Indoor lighting and atmosphere
The scene SHALL implement a warm indoor library lighting setup (ambient plus localized lamp lights) with tone mapping, such that geometry is readable in all traversable areas and no traversable area is fully dark.

#### Scenario: Visibility everywhere traversable
- **WHEN** the player stands at any traversable position
- **THEN** surrounding walls, shelves, and doorways are visible without adjusting monitor brightness

### Requirement: Performance target
The application SHALL sustain interactive frame rates on a mid-range laptop: 60 FPS target and 30 FPS minimum while walking through galleries, using level-of-detail and/or culling of non-adjacent galleries as needed.

#### Scenario: Walking through galleries
- **WHEN** the player walks continuously between three adjacent galleries for 60 seconds
- **THEN** the frame rate does not drop below 30 FPS and no visible hitching occurs at gallery boundaries

### Requirement: Graceful degradation without WebGL
The app SHALL detect a missing/failed WebGL2 context and show a human-readable error page instead of a blank screen or uncaught exception.

#### Scenario: WebGL unavailable
- **WHEN** the page loads in a browser with WebGL2 disabled
- **THEN** the user sees a message explaining the requirement instead of a blank canvas
