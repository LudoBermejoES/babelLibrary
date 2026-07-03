import * as THREE from 'three';
import type { GalleryBuffers } from '../wasm';
import { BOOK_ARCHETYPE_COUNT, createAsset } from './assets';

const shelfBayGeometry = (createAsset('shelfBay') as THREE.Mesh).geometry;
const shelfBayMaterial = (createAsset('shelfBay') as THREE.Mesh).material as THREE.Material;
const lampGeometry = (createAsset('lamp') as THREE.Mesh).geometry;
const lampMaterial = (createAsset('lamp') as THREE.Mesh).material as THREE.Material;
const bookGeometry = (createAsset('book', 0) as THREE.Mesh).geometry;
const bookMaterial = (createAsset('book', 0) as THREE.Mesh).material as THREE.Material;

export interface GalleryInstances {
  group: THREE.Group;
  bookCount: number;
  shelfCount: number;
  lampCount: number;
}

/**
 * Builds one gallery's instanced meshes (shelves, lamps, books) directly
 * from the generator's flat buffers — no per-instance Matrix4/setMatrixAt
 * loop, per doc 05 "Fill instanceMatrix.array directly from the copied
 * buffers." Book archetype = `bookId % BOOK_ARCHETYPE_COUNT`, partitioned
 * into up to `BOOK_ARCHETYPE_COUNT` InstancedMeshes sharing one material.
 */
export function buildGalleryInstances(buffers: GalleryBuffers): GalleryInstances {
  const group = new THREE.Group();
  group.name = 'instances';

  const shelfCount = buffers.shelfTransforms.length / 16;
  group.add(buildTransformOnlyInstancedMesh(shelfBayGeometry, shelfBayMaterial, buffers.shelfTransforms, shelfCount));

  const lampCount = countPropsOfKind(buffers.propTransforms, 1 /* lamp */);
  group.add(buildLampInstances(buffers.propTransforms, lampCount));

  const bookCount = buffers.bookIds.length;
  for (const mesh of buildBookInstances(buffers)) {
    group.add(mesh);
  }

  return { group, bookCount, shelfCount, lampCount };
}

function buildTransformOnlyInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: Float32Array,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  writeMatrices(mesh, transforms, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

/** `prop_transforms` records are `[kind, m0..m15]` (17 f32, doc 04). */
function countPropsOfKind(propTransforms: Float32Array, kind: number): number {
  let count = 0;
  for (let i = 0; i + 17 <= propTransforms.length; i += 17) {
    if (propTransforms[i] === kind) count++;
  }
  return count;
}

function buildLampInstances(propTransforms: Float32Array, lampCount: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(lampGeometry, lampMaterial, lampCount);
  const matrix = new THREE.Matrix4();
  let instanceIndex = 0;
  for (let i = 0; i + 17 <= propTransforms.length; i += 17) {
    if (propTransforms[i] !== 1) continue;
    matrix.fromArray(propTransforms, i + 1);
    mesh.setMatrixAt(instanceIndex, matrix);
    instanceIndex++;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

function writeMatrices(mesh: THREE.InstancedMesh, transforms: Float32Array, count: number): void {
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    matrix.fromArray(transforms, i * 16);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Partitions book instances by `bookId % BOOK_ARCHETYPE_COUNT`, writing transform + color directly into each archetype's InstancedMesh (doc 05 "Book instancing"). */
function* buildBookInstances(buffers: GalleryBuffers): Generator<THREE.InstancedMesh> {
  const totalBooks = buffers.bookIds.length;
  const byArchetype: number[][] = Array.from({ length: BOOK_ARCHETYPE_COUNT }, () => []);
  for (let i = 0; i < totalBooks; i++) {
    const archetype = buffers.bookIds[i]! % BOOK_ARCHETYPE_COUNT;
    byArchetype[archetype]!.push(i);
  }

  const matrix = new THREE.Matrix4();
  for (let archetype = 0; archetype < BOOK_ARCHETYPE_COUNT; archetype++) {
    const indices = byArchetype[archetype]!;
    if (indices.length === 0) continue;

    const mesh = new THREE.InstancedMesh(bookGeometry, bookMaterial, indices.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(indices.length * 3), 3);
    const bookIds = new Uint32Array(indices.length);

    indices.forEach((sourceIndex, instanceIndex) => {
      matrix.fromArray(buffers.bookTransforms, sourceIndex * 16);
      mesh.setMatrixAt(instanceIndex, matrix);
      mesh.instanceColor!.setXYZ(
        instanceIndex,
        buffers.bookColors[sourceIndex * 3]!,
        buffers.bookColors[sourceIndex * 3 + 1]!,
        buffers.bookColors[sourceIndex * 3 + 2]!,
      );
      bookIds[instanceIndex] = buffers.bookIds[sourceIndex]!;
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceColor.needsUpdate = true;
    mesh.userData.bookIds = bookIds;
    yield mesh;
  }
}
