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
| Floor/ceiling | hex from `graph_json` center + side constant | one `ShapeGeometry` hex each, shared material |
| Walls & doorframes | `wall_segments` | wall pieces as `BoxGeometry` segments (doorway kind → two flanking boxes + lintel), shared material; merged per gallery with `BufferGeometryUtils.mergeGeometries` → 1 draw |
| Shelf bays | `shelf_transforms` + shelf GLB | one `InstancedMesh` per gallery |
| Books | `book_transforms`/`book_colors` | `InstancedMesh` per (gallery × archetype), see below |
| Tables/lamps | `prop_transforms` | small `InstancedMesh` per kind |

### Book instancing

- ~5 book **archetypes** (GLBs differing in silhouette: flat-top, rounded spine, slightly worn, etc.), all unit-sized (1×1×1 m spine-aligned) so the generator's per-instance matrix provides actual dimensions.
- Archetype choice = `bookId % 5` (deterministic, no extra buffer). Partition the gallery's instances by archetype into up to 5 `InstancedMesh`es sharing one `MeshStandardMaterial` (vertex-color-free; per-instance color via `instanceColor`).
- Fill `instanceMatrix.array` / `instanceColor.array` directly from the copied buffers (no per-instance `setMatrixAt` loop over Matrix4 objects); set `needsUpdate` once; `instanceMatrix.setUsage(StaticDrawUsage)`.
- `frustumCulled = true` per InstancedMesh (whole-mesh culling; fine since meshes are per-gallery).
- Raycast → `(mesh, instanceId)` → `mesh.userData.bookIds[instanceId]` (the copied `Uint32Array`). Book highlight technique in doc 07.

### Draw-call budget (spec: < 100 with 2,000+ books in view)

Per visible gallery: 1 floor + 1 ceiling + 1 merged walls + 1 shelves + ≤5 books + 2 props ≈ **11 draws**. With current + up to 6 neighbors visible through doorways: ≈ 77. Within budget; verify with `renderer.info.render.calls` in the debug HUD.

## Assets

| Asset | Source (CC0) | Notes |
|---|---|---|
| Shelf bay | Poly Haven / Kenney furniture kit | swap-in; a `BoxGeometry` placeholder bay works from day one |
| Book archetypes ×5 | Quaternius / Kenney or 20-min Blender job | unit-sized, ≤ 300 tris each |
| Table, lamp | Kenney/Poly Haven | lamp emissive material |
| Floor/wall textures | Poly Haven (wood, plaster) | 1K, repeated |

Pipeline: `gltf-transform optimize <in> <out> --compress meshopt` at build time (`scripts/assets.sh`); loaded with `GLTFLoader` + `MeshoptDecoder`. Every asset's source URL + license recorded in `web/public/assets/CREDITS.md`. **Placeholder-first rule:** every asset has a procedural placeholder (BoxGeometry equivalents) so rendering work never blocks on art.

## Lighting

- `AmbientLight(0xfff2e0, 0.35)` — warm base so nothing is pitch black (spec: all traversable areas readable).
- Per gallery: 1 `PointLight(0xffd9a0, intensity ~12, distance 12, decay 2)` at ceiling center + emissive lamp materials. Lights belong to the gallery's `Group`, so only current+adjacent galleries' lights exist (≤ ~7 point lights, WebGL-friendly).
- No shadows in v1 (biggest single perf lever); fake grounding with a subtle radial-gradient AO texture on the floor under shelves/tables. Baked lightmaps are the polish-phase upgrade.
- `FogExp2(0x14100c, 0.045)` — depth cue through door openings, hides the far plane.

## Gallery streaming

- Scene graph holds `Group`s for the **current gallery + all doorway-adjacent galleries** only (satisfies "the room you enter is already present").
- Membership recomputed on gallery change (player crosses a doorway plane, detected in the controls tick): `needed = {current} ∪ neighbors(current)`. Build missing groups from `getGallery(i)` buffers; dispose groups not in `needed` (`geometry.dispose()`, shared materials kept in a registry and never disposed).
- Building a gallery ≈ a few ms (buffer copies + 5 InstancedMesh allocations); do it synchronously on crossing (it's a neighbor-of-neighbor, invisible), or behind `requestIdleCallback` — measure first, don't pre-optimize.
- A `GalleryCache` keeps the last 4 disposed galleries' *buffers* (not meshes) to make back-and-forth crossing cheap.

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
- Known levers if the budget is blown, in order: drop pixel ratio to 1 → reduce point-light distance/count → merge book archetypes into 1 → shrink neighbor set to doorway-visible only.
