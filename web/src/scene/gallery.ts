import * as THREE from 'three';
import type { GalleryBuffers, LibraryConfig, LibraryGallery } from '../wasm';
import { buildFloorAndCeiling, buildShaftWell } from './hex-shell';

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6f4e, roughness: 0.8 });

/** One hexagonal gallery's static architecture: floor/ceiling (with a central shaft hole) + walls built from `wall_segments`. All geometry derives from the generator's buffers/config — nothing here is hard-coded per doc 05. */
export function buildGalleryArchitecture(
  gallery: LibraryGallery,
  buffers: GalleryBuffers,
  config: LibraryConfig,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `gallery-${gallery.index}`;

  const { floor, ceiling } = buildFloorAndCeiling(gallery.center, config);
  group.add(floor);
  group.add(ceiling);
  group.add(buildShaftWell(gallery.center, config));

  const wallThickness = 0.15;
  for (const segment of iterateWallSegments(buffers.wallSegments)) {
    if (segment.kind === 1) {
      addVestibuleOpeningWall(group, segment, wallThickness);
    } else {
      addSolidWall(group, segment, wallThickness);
    }
  }

  return group;
}

interface WallSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
  kind: number;
  doorCenter: number;
  doorWidth: number;
}

function* iterateWallSegments(buffer: Float32Array): Generator<WallSegment> {
  for (let i = 0; i + 8 <= buffer.length; i += 8) {
    const record = buffer.subarray(i, i + 8);
    yield {
      x1: record[0]!,
      z1: record[1]!,
      x2: record[2]!,
      z2: record[3]!,
      height: record[4]!,
      kind: record[5]!,
      doorCenter: record[6]!,
      doorWidth: record[7]!,
    };
  }
}

function addSolidWall(group: THREE.Group, segment: WallSegment, thickness: number): void {
  const mesh = wallBoxBetween(segment.x1, segment.z1, segment.x2, segment.z2, segment.height, thickness);
  group.add(mesh);
}

/** Two flanking wall pieces + a lintel above the opening, leaving `doorWidth` clear (doc 05/06). */
function addVestibuleOpeningWall(group: THREE.Group, segment: WallSegment, thickness: number): void {
  const { x1, z1, x2, z2, height, doorWidth } = segment;
  const alongLen = Math.hypot(x2 - x1, z2 - z1);
  const halfOpen = doorWidth / 2;
  const flankLen = Math.max(alongLen / 2 - halfOpen, 0);

  if (flankLen > 0) {
    const dirX = (x2 - x1) / alongLen;
    const dirZ = (z2 - z1) / alongLen;
    group.add(wallBoxBetween(x1, z1, x1 + dirX * flankLen, z1 + dirZ * flankLen, height, thickness));
    group.add(wallBoxBetween(x2 - dirX * flankLen, z2 - dirZ * flankLen, x2, z2, height, thickness));
  }

  const lintelBottom = Math.max(height - 0.4, 0);
  const lintel = wallBoxBetween(x1, z1, x2, z2, height, thickness);
  lintel.position.y = lintelBottom + (height - lintelBottom) / 2;
  lintel.scale.y = (height - lintelBottom) / height;
  group.add(lintel);
}

function wallBoxBetween(x1: number, z1: number, x2: number, z2: number, height: number, thickness: number): THREE.Mesh {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const geometry = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geometry, wallMaterial);
  mesh.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2);
  mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  return mesh;
}
