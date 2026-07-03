# 05 — Rendering

## Renderer setup

- `WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })`; `outputColorSpace = SRGBColorSpace`; `toneMapping = ACESFilmicToneMapping`, exposure ~1.0; `setPixelRatio(min(devicePixelRatio, 2))`.
- Camera: `PerspectiveCamera(70, aspect, 0.05, 60)` — far plane tight (galleries are small; distant rooms aren't in the graph anyway).
- WebGL2 detection before any scene work: if context creation fails, replace the canvas with a static explanatory panel (spec: no blank screen). Also install `webglcontextlost` handler → reload prompt.
- Resize: observe the canvas container, update aspect + `setSize`.

## Scene composition (all data from the generator — nothing hard-coded)

Per gallery, built from `GalleryBuffers` (doc 04):

| Element | Source | Technique |
|---|---|---|
| Floor/ceiling | hex from `graph_json` center + side constant, with a circular hole at the center for the shaft | one `ShapeGeometry` hex (with hole path) each, shared material |
| Shelf walls & vestibule opening | `wall_segments` | wall pieces as `BoxGeometry` segments (vestibule-opening kind → two flanking boxes + lintel), shared material; merged per gallery with `BufferGeometryUtils.mergeGeometries` → 1 draw. Always exactly 4 shelf walls + 1 opening per hexagon (doc 04). |
| Central shaft | `shaft_colliders` (collision) + fixed-radius geometry (visual) | a low ring mesh (railing) + the floor/ceiling holes above; looking through reveals the hexagon at the same `(q, r)` on the floor above/below, if generated |
| Vestibule room | `vestibule` buffer | small boxed anteroom geometry, a mirror plane (high-metalness/low-roughness material + `PMREMGenerator` env map — not a full reflection render pass), 2 closet-door meshes, and — where flagged — a spiral staircase GLB/procedural mesh (up, down, or both) |
| Shelf bays | `shelf_transforms` + shelf GLB | one `InstancedMesh` per gallery, always 4 instances |
| Books | `book_transforms`/`book_colors` | `InstancedMesh` per (gallery × archetype), see below |
| Tables/lamps | `prop_transforms` | small `InstancedMesh` per kind, always 2 lamps + 0–2 tables |

### Book instancing

- ~5 book **archetypes** (GLBs differing in silhouette: flat-top, rounded spine, slightly worn, etc.), all unit-sized (1×1×1 m spine-aligned) so the generator's per-instance matrix provides actual dimensions.
- Archetype choice = `bookId % 5` (deterministic, no extra buffer). Partition the gallery's instances by archetype into up to 5 `InstancedMesh`es sharing one `MeshStandardMaterial` (vertex-color-free; per-instance color via `instanceColor`).
- Fill `instanceMatrix.array` / `instanceColor.array` directly from the copied buffers (no per-instance `setMatrixAt` loop over Matrix4 objects); set `needsUpdate` once; `instanceMatrix.setUsage(StaticDrawUsage)`.
- `frustumCulled = true` per InstancedMesh (whole-mesh culling; fine since meshes are per-gallery).
- Raycast → `(mesh, instanceId)` → `mesh.userData.bookIds[instanceId]` (the copied `Uint32Array`). Book highlight technique in doc 07.

### Draw-call budget (spec: < 100 with 2,000+ books in view)

Per visible gallery: 1 floor + 1 ceiling + 1 merged walls + 1 shaft railing + 1 shelves + ≤5 books + 2 props + 1 vestibule room + 1 mirror + 1 closets(merged) + 0–2 staircase ≈ **14–16 draws**. Visible set per doc's streaming section now includes the floor-above/below hexagon glimpsed through the shaft opening when present, plus current + horizontal neighbors: roughly current + 4 horizontal neighbors + 2 vertical (above/below, shaft-visible only, not fully loaded) ≈ 90–110. This is tighter than the original flat-world budget — the levers below apply sooner. Verify with `renderer.info.render.calls` in the debug HUD; if consistently over budget, the shaft's above/below glimpse can be downgraded to a static "looks like a hexagon" impostor plane instead of the real adjacent-floor geometry.

## Assets

| Asset | Source (CC0) | Notes |
|---|---|---|
| Shelf bay | Poly Haven / Kenney furniture kit | swap-in; a `BoxGeometry` placeholder bay works from day one |
| Book archetypes ×5 | Quaternius / Kenney or 20-min Blender job | unit-sized, ≤ 300 tris each |
| Table, lamp | Kenney/Poly Haven | lamp emissive material |
| Floor/wall textures | Poly Haven (wood, plaster) | 1K, repeated |

Pipeline: `gltf-transform optimize <in> <out> --compress meshopt` at build time (`scripts/assets.sh`); loaded with `GLTFLoader` + `MeshoptDecoder`. Every asset's source URL + license recorded in `web/public/assets/CREDITS.md`. **Placeholder-first rule:** every asset has a procedural placeholder (BoxGeometry equivalents) so rendering work never blocks on art.

## Lighting

Borges is explicit here: "the light they give is insufficient, and unceasing" — two lamps, always on, deliberately dim. This is a constraint, not a suggestion; resist the urge to brighten the scene for readability at the cost of atmosphere — use the ambient floor instead.

- `AmbientLight(0xfff2e0, 0.35)` — warm base so nothing is pitch black (spec: all traversable areas readable) while staying true to "insufficient" light.
- Per gallery: exactly **2** `PointLight(0xffd9a0, intensity ~8, distance 10, decay 2)` at the two lamp prop positions from `prop_transforms` (crosswise placement, per doc 04) — dimmer than a single central light would be, matching "insufficient." Lights belong to the gallery's `Group`, so only current+adjacent galleries' lights exist.
- No shadows in v1 (biggest single perf lever); fake grounding with a subtle radial-gradient AO texture on the floor under shelves/tables. Baked lightmaps are the polish-phase upgrade.
- `FogExp2(0x14100c, 0.045)` — depth cue through vestibule openings and the shaft, hides the far plane; also visually explains why the "endless" floors above/below fade to darkness rather than needing to render arbitrarily far.

## Gallery streaming

- Scene graph holds `Group`s for the **current gallery + its horizontal neighbor (through the vestibule) + its vertical neighbors (floor above/below, if present)** — satisfies "the room you enter is already present" for both a horizontal step through a vestibule and a vertical step up/down the staircase.
- Membership recomputed on gallery change (player crosses a vestibule threshold or ascends/descends a staircase, detected in the controls tick): `needed = {current} ∪ horizontalNeighbor(current) ∪ {floorAbove(current), floorBelow(current)}`. Build missing groups from `getGallery(i)` buffers; dispose groups not in `needed` (`geometry.dispose()`, shared materials kept in a registry and never disposed).
- The floor-above/below groups are **shaft-visible only** in most cases: full geometry is unnecessary if the player hasn't taken the stairs yet, since they're only glimpsed through the shaft opening. A cheap version (floor/ceiling hex + shaft railing only, no shelves/books) is built for the shaft glimpse; the moment the player actually starts climbing/descending that hexagon's staircase, it's upgraded to the full gallery.
- Building a gallery ≈ a few ms (buffer copies + 4 shelf-bay + 5 book-archetype InstancedMesh allocations, always the same counts now); do it synchronously on crossing (it's a neighbor-of-neighbor, invisible), or behind `requestIdleCallback` — measure first, don't pre-optimize.
- A `GalleryCache` keeps the last 4 disposed galleries' *buffers* (not meshes) to make back-and-forth crossing (including up-then-back-down a staircase) cheap.

## Frame loop order

```ts
renderer.setAnimationLoop((t) => {
  const dt = clock.getDelta();          // capped at 0.1 s (tab-switch protection)
  controls.update(dt);                  // input → velocity → collide → position (doc 06)
  streaming.update(playerGallery);      // no-op unless gallery changed
  interact.update(camera);              // raycast + HUD (doc 07); skipped when reader open
  renderer.render(scene, camera);
});
```

## Performance verification (spec targets: 60 target / 30 floor, < 100 calls)

- Debug HUD (dev builds, `?debug`): FPS (rolling 1 s), `renderer.info.render.calls`, triangles, current gallery, draw of collider boxes (`Box3Helper`) toggle.
- Test scenario (doc 09): seeded 3k-book catalog, scripted 60 s walk across three galleries; assert min FPS ≥ 30 and calls < 100 via the HUD's recorded stats dumped to console.
- Known levers if the budget is blown, in order: drop pixel ratio to 1 → reduce point-light distance/count → merge book archetypes into 1 → downgrade the shaft's floor-above/below glimpse to a static impostor → shrink neighbor set to vestibule-visible only.
