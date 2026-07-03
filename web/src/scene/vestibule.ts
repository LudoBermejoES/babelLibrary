import * as THREE from 'three';
import type { GalleryBuffers } from '../wasm';
import { createAsset } from './assets';

/** Parsed `vestibule` buffer (doc 04): `[hasStairUp, hasStairDown, hasHorizontalNeighbor, mirrorTransform(16), closetLeftPos(3), closetRightPos(3)]`. */
interface VestibuleRecord {
  hasStairUp: boolean;
  hasStairDown: boolean;
  hasHorizontalNeighbor: boolean;
  mirrorTransform: Float32Array;
  closetLeftPos: [number, number, number];
  closetRightPos: [number, number, number];
}

function parseVestibule(buffer: Float32Array): VestibuleRecord {
  return {
    hasStairUp: buffer[0] === 1,
    hasStairDown: buffer[1] === 1,
    hasHorizontalNeighbor: buffer[2] === 1,
    mirrorTransform: buffer.subarray(3, 19),
    closetLeftPos: [buffer[19]!, buffer[20]!, buffer[21]!],
    closetRightPos: [buffer[22]!, buffer[23]!, buffer[24]!],
  };
}

export interface VestibuleCounts {
  mirrors: number;
  closets: number;
  staircases: number;
}

/**
 * Builds the vestibule room contents (mirror + 2 closets, always; a
 * staircase mesh only where the buffer's stair-up/stair-down flags are
 * set) directly from the `vestibule` buffer, per doc 05.
 */
export function buildVestibule(buffers: GalleryBuffers): { group: THREE.Group; counts: VestibuleCounts } {
  const record = parseVestibule(buffers.vestibule);
  const group = new THREE.Group();
  group.name = 'vestibule';

  const mirror = createAsset('mirror');
  mirror.matrixAutoUpdate = false;
  mirror.matrix.fromArray(record.mirrorTransform);
  mirror.matrix.decompose(mirror.position, mirror.quaternion, mirror.scale);
  mirror.matrixAutoUpdate = true;
  group.add(mirror);

  const closetLeft = createAsset('closetDoor');
  closetLeft.position.set(...record.closetLeftPos);
  group.add(closetLeft);

  const closetRight = createAsset('closetDoor');
  closetRight.position.set(...record.closetRightPos);
  group.add(closetRight);

  let staircases = 0;
  if (record.hasStairUp || record.hasStairDown) {
    const staircase = createAsset('staircase');
    const midpoint: [number, number, number] = [
      (record.closetLeftPos[0] + record.closetRightPos[0]) / 2,
      (record.closetLeftPos[1] + record.closetRightPos[1]) / 2,
      (record.closetLeftPos[2] + record.closetRightPos[2]) / 2,
    ];
    staircase.position.set(...midpoint);
    group.add(staircase);
    staircases = 1;
  }

  return { group, counts: { mirrors: 1, closets: 2, staircases } };
}

/** Shaft railing ring from `shaft_colliders` (6 f32 AABBs per box, doc 04) — visual boxes matching the collision geometry 1:1. */
export function buildShaftRailing(buffers: GalleryBuffers): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shaft-railing';
  const material = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.6, roughness: 0.4 });

  const buffer = buffers.shaftColliders;
  for (let i = 0; i + 6 <= buffer.length; i += 6) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = buffer.subarray(i, i + 6) as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const geometry = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    group.add(mesh);
  }

  return group;
}
