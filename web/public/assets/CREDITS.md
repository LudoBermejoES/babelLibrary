# Asset credits

No GLB assets have been sourced yet. Every model referenced in
[doc/05-rendering.md](../../../doc/05-rendering.md) currently uses a
procedural `BoxGeometry`/`MeshStandardMaterial` placeholder from
`web/src/scene/assets.ts`, per the "placeholder-first rule" — rendering and
gameplay work is not blocked on art sourcing.

| Asset | Status | Planned source (CC0) |
|---|---|---|
| Shelf bay | placeholder | Poly Haven / Kenney furniture kit |
| Table | placeholder | Kenney / Poly Haven |
| Lamp | placeholder | Kenney / Poly Haven |
| Mirror | placeholder (material only, no glass mesh) | modeled in-house or Poly Haven |
| Closet door | placeholder | Kenney / Poly Haven |
| Spiral staircase | placeholder | Kenney / Poly Haven, or modeled in-house |
| Book archetypes (x5) | placeholder | Quaternius / Kenney, or a short in-house Blender pass |

When a real asset replaces a placeholder, add its row here with: source URL,
license (must be CC0), and the commit that swapped it in.
