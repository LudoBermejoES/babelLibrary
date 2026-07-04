# scene-rendering (delta)

> Modifies the `scene-rendering` capability from `library-3d-environment`.
> Implementation: doc [05](../../../../../doc/05-rendering.md).

## ADDED Requirements

### Requirement: No traversable sightline shows a void

From any traversable position, no primary sightline SHALL show a black void
where the library should continue. Specifically: looking through a vestibule
opening SHALL show the connected neighbor gallery's interior; looking at the
shaft-facing wall SHALL show library beyond (a railed opening onto replicated
gallery interior), not an open black gap; and looking up or down the central
shaft SHALL always show gallery geometry, including at the top and bottom
generated floors via vertical visual wrap.

#### Scenario: Vestibule opening shows the neighbor
- **WHEN** the player looks through a gallery's vestibule opening toward its horizontal neighbor
- **THEN** the neighbor gallery's interior (or the connecting anteroom leading to it) is visible, not empty black space

#### Scenario: Shaft-facing wall shows library
- **WHEN** the player looks at the shaft-facing wall of a gallery
- **THEN** they see a railed opening onto the central shaft with gallery interior visible beyond it, not an open black gap

#### Scenario: Shaft wrap at the top floor
- **WHEN** the player is on the top generated floor and looks up the central shaft
- **THEN** gallery geometry (the wrapped floor's content) is visible above, not black — the vertical dimension reads as periodic

#### Scenario: Shaft wrap at the bottom floor
- **WHEN** the player is on the bottom generated floor and looks down the central shaft
- **THEN** gallery geometry is visible below, not black

#### Scenario: Black-void survey regression gate
- **WHEN** the automated survey stands in the spawn gallery and looks through the vestibule opening, at the shaft-facing wall, and straight up and down the shaft
- **THEN** each view's near-black pixel fraction is small (well under the 41–86% the pre-fix build exhibits)

## MODIFIED Requirements

### Requirement: Instanced rendering for books

Books SHALL be rendered with instanced meshes (`InstancedMesh` or
equivalent), with per-instance transform and color, so that thousands of
visible books do not create thousands of draw calls. Disposing a gallery's
scene group MUST free that group's per-gallery geometry and each
`InstancedMesh`'s own instance buffers, but MUST NOT dispose the shared
module-level instanced geometry that other live galleries still reference.

#### Scenario: Draw call budget
- **WHEN** a gallery with at least 2,000 books is in view
- **THEN** all book spines render via instancing and the total scene draw calls remain under 100

#### Scenario: Disposing a gallery does not corrupt others
- **WHEN** a gallery leaves the streaming set and is disposed while another gallery using the same shared book/shelf/lamp geometry is still live
- **THEN** the shared geometry is not disposed (the surviving gallery still renders), while the disposed gallery's own instance buffers and per-gallery geometry are freed
