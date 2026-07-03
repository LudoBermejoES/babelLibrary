import * as THREE from 'three';

/**
 * Placeholder-first asset registry (doc 05): every real-art asset (CC0
 * GLBs, sourced later) has a procedural stand-in here so rendering/gameplay
 * work never blocks on art. See web/public/assets/CREDITS.md for status.
 */

export const BOOK_ARCHETYPE_COUNT = 5;

type StaticAssetKind = 'shelfBay' | 'table' | 'lamp' | 'mirror' | 'closetDoor' | 'staircase';

const shelfBayMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 });
const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.8 });
const lampMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd9a0,
  emissive: 0xffd9a0,
  emissiveIntensity: 1.0,
});
const mirrorMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 1.0, roughness: 0.05 });
const closetDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.7 });
const staircaseMaterial = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.6 });
const bookMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });

function boxPlaceholder(size: [number, number, number], material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(...size), material);
}

/** Unit-sized (1x1x1 m) book placeholder — the generator's per-instance transform supplies actual spine dimensions (doc 05 "Book instancing"). */
function bookPlaceholder(archetype: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, bookMaterial);
  mesh.userData.archetype = archetype;
  return mesh;
}

export function createAsset(kind: StaticAssetKind): THREE.Object3D;
export function createAsset(kind: 'book', archetype: number): THREE.Object3D;
export function createAsset(kind: StaticAssetKind | 'book', archetype?: number): THREE.Object3D {
  switch (kind) {
    case 'shelfBay':
      return boxPlaceholder([3.2, 3.2, 0.35], shelfBayMaterial);
    case 'table':
      return boxPlaceholder([1.2, 0.75, 0.7], tableMaterial);
    case 'lamp':
      return boxPlaceholder([0.2, 0.2, 0.2], lampMaterial);
    case 'mirror':
      return boxPlaceholder([1.2, 2.0, 0.02], mirrorMaterial);
    case 'closetDoor':
      return boxPlaceholder([0.6, 2.0, 0.05], closetDoorMaterial);
    case 'staircase':
      return boxPlaceholder([2.0, 3.2, 2.0], staircaseMaterial);
    case 'book': {
      if (archetype === undefined || archetype < 0 || archetype >= BOOK_ARCHETYPE_COUNT) {
        throw new Error(`book archetype out of range: ${archetype}`);
      }
      return bookPlaceholder(archetype);
    }
    default:
      throw new Error(`unknown asset kind: ${kind satisfies never}`);
  }
}
