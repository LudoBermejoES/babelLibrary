import * as THREE from 'three';
import type { LibraryConfig } from '../wasm';

// Shared module-level materials for the hex floor/ceiling. Both the full
// gallery architecture and the cheap shaft glimpse use the SAME instances so
// disposal never has to special-case a per-glimpse material (doc 05: shared
// materials stay undisposed; only per-gallery geometry + instance buffers are
// freed). These match the colors gallery.ts used before the extraction.
// DoubleSide: looking up the shaft you see the ceiling's underside and the
// floor-above glimpse's underside; looking down, the floor's topside and the
// floor-below's topside. Single-sided hex shells got back-face-culled from
// the shaft sightline, leaving the vertical view see-through to void.
export const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x5a4632,
  roughness: 0.9,
  side: THREE.DoubleSide,
});
export const ceilingMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a2f22,
  roughness: 0.95,
  side: THREE.DoubleSide,
});
// Inner wall of the central shaft. DoubleSide so it's visible from inside the
// tube (we look at its interior down the well) and doesn't vanish if the camera
// briefly straddles the surface. Shared like the other two.
export const shaftWellMaterial = new THREE.MeshStandardMaterial({
  color: 0x4a3c2a,
  roughness: 0.85,
  side: THREE.DoubleSide,
});

// Far enclosing shell (buildEnclosingShell). Very dark warm stone, BackSide so
// only its interior renders (we are always inside it). Reads as the library
// receding into darkness — any sightline that escapes the real geometry lands
// here instead of on void.
export const enclosingShellMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a2118,
  roughness: 1,
  side: THREE.BackSide,
});

// How many ceiling-heights the shaft well spans in each direction from a
// gallery's center. The library is vertically periodic and infinite; a finite
// but tall tube reads as "the shaft continues up and down forever" and, being
// solid-walled, means a straight up/down sightline lands on lit stone instead
// of seeing through the aligned floor holes into black void (the shaftUp void
// the no-void survey caught). Kept modest so the per-gallery geometry stays
// cheap.
const SHAFT_WELL_FLOORS = 8;

/**
 * Flat-top hexagon outline of `side` length, centered at the origin, matching
 * babel-gen's `hex_apothem`/wall layout (wall 0 faces +x). The vertices sit at
 * 30° + 60°·i so the edges (walls) face 0°/60°/120°… — the same convention the
 * generator emits wall segments and vestibule directions against.
 */
export function hexShape(side: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const x = side * Math.cos(angle);
    const z = side * Math.sin(angle);
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

/**
 * Flat-top hex `ShapeGeometry` with the central shaft hole punched out, already
 * rotated flat into the XZ plane (floor orientation). Freshly allocated per
 * call — it is per-gallery geometry the caller owns and must dispose.
 */
export function hexFloorGeometry(config: LibraryConfig): THREE.ShapeGeometry {
  const outer = hexShape(config.hexSide);
  const hole = new THREE.Path();
  hole.absarc(0, 0, config.shaftRadius, 0, Math.PI * 2, false);
  outer.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(outer);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Floor + ceiling meshes (each with the shaft hole) for one hex cell centered
 * at `center`, using the shared floor/ceiling materials. The two meshes SHARE
 * one geometry instance — the caller disposes it exactly once (via either
 * mesh's `.geometry`) when tearing the cell down. Used by both the full
 * gallery build and the shaft glimpse so the two never drift apart.
 */
export function buildFloorAndCeiling(
  center: readonly [number, number, number],
  config: LibraryConfig,
): { floor: THREE.Mesh; ceiling: THREE.Mesh } {
  const [cx, cy, cz] = center;
  const geometry = hexFloorGeometry(config);

  const floor = new THREE.Mesh(geometry, floorMaterial);
  floor.position.set(cx, cy, cz);

  const ceiling = new THREE.Mesh(geometry, ceilingMaterial);
  ceiling.position.set(cx, cy + config.ceilingHeight, cz);
  ceiling.rotateX(Math.PI);

  return { floor, ceiling };
}

/**
 * The central shaft "well": a tall open-ended cylinder of `shaftRadius` around
 * the gallery's shaft, its inner surface visible from inside the tube. Because
 * the library is vertically periodic and infinite, looking straight up or down
 * the shaft must land on the well wall, not pass through the aligned floor
 * holes into black void. Spans `SHAFT_WELL_FLOORS` ceiling-heights each way so
 * the tube reads as continuing forever. Freshly allocated per call — the
 * caller owns and disposes the geometry.
 */
export function buildShaftWell(
  center: readonly [number, number, number],
  config: LibraryConfig,
): THREE.Mesh {
  const [cx, cy, cz] = center;
  const height = config.ceilingHeight * SHAFT_WELL_FLOORS * 2;
  // Slightly inside shaftRadius so it never z-fights the floor/ceiling hole rim.
  const radius = config.shaftRadius * 0.98;
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 24, 1, true);
  const mesh = new THREE.Mesh(geometry, shaftWellMaterial);
  // Centered on the gallery's own floor level; extends symmetrically up/down.
  mesh.position.set(cx, cy + config.ceilingHeight / 2, cz);
  return mesh;
}

// Enclosing shell radius/height, in gallery-widths / ceiling-heights. Big
// enough to sit well beyond the current gallery + its immediate neighbors, so
// it never intersects real geometry, but within fog range (FogExp2 density
// 0.045 → effectively opaque by ~30-40m) so it reads as dark distance rather
// than a visible wall. hexSide is 4m, so 8·hexSide ≈ 32m radius.
const ENCLOSING_RADIUS_HEXES = 8;
const ENCLOSING_HALF_HEIGHT_FLOORS = 10;

/**
 * A large inward-facing shell (cylinder wall + top/bottom caps) around the
 * current gallery neighborhood. Any horizontal or oblique sightline that
 * escapes the real (and replicated shaft/wrap) geometry terminates on this
 * shell instead of on void — so an open vestibule doorway or shaft-opposite
 * wall on an edge gallery shows the library receding into warm darkness, never
 * a black (or, with the fog clear color, flat) hole. One draw call per cap +
 * wall; BackSide so only the interior we stand in renders. Fog fades it to near
 * the ambient darkness, so it never reads as a hard boundary. Freshly allocated
 * per call; caller owns and disposes the geometry.
 */
export function buildEnclosingShell(
  center: readonly [number, number, number],
  config: LibraryConfig,
): THREE.Group {
  const [cx, cy, cz] = center;
  const radius = config.hexSide * ENCLOSING_RADIUS_HEXES;
  const halfHeight = config.ceilingHeight * ENCLOSING_HALF_HEIGHT_FLOORS;

  const group = new THREE.Group();
  group.name = 'enclosing-shell';

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 32, 1, true),
    enclosingShellMaterial,
  );
  wall.position.set(cx, cy, cz);
  group.add(wall);

  // Top and bottom caps (discs) so a steep up/down look that clears the shaft
  // well and floor holes still lands on the shell, not void above/below.
  for (const sign of [1, -1] as const) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), enclosingShellMaterial);
    cap.position.set(cx, cy + sign * halfHeight, cz);
    // CircleGeometry faces +z by default; rotate flat and orient its front face
    // inward (down for the top cap, up for the bottom).
    cap.rotation.x = sign * (Math.PI / 2);
    group.add(cap);
  }

  return group;
}
