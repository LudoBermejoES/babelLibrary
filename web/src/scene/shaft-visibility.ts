import * as THREE from 'three';
import type { LibraryConfig, LibraryGallery } from '../wasm';

/**
 * Cheap "glimpse" geometry for a shaft-visible neighbor gallery: just the
 * floor/ceiling hex (with the shaft hole), no shelves, books, or vestibule
 * — doc 05 "shaft-visible only" streaming tier. Looking down/up a gallery's
 * shaft reveals this for its floor-below/floor-above counterpart, if one
 * was generated; the `GalleryStreamer` upgrades it to a full build the
 * moment the player actually starts climbing/descending into it.
 */
export function buildShaftGlimpse(gallery: LibraryGallery, config: LibraryConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = `shaft-glimpse-${gallery.index}`;

  const [cx, cy, cz] = gallery.center;
  const outer = hexShape(config.hexSide);
  const hole = new THREE.Path();
  hole.absarc(0, 0, config.shaftRadius, 0, Math.PI * 2, false);
  outer.holes.push(hole);

  const floorGeometry = new THREE.ShapeGeometry(outer);
  floorGeometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });

  const floor = new THREE.Mesh(floorGeometry, material);
  floor.position.set(cx, cy, cz);
  group.add(floor);

  const ceiling = new THREE.Mesh(floorGeometry.clone(), material);
  ceiling.position.set(cx, cy + config.ceilingHeight, cz);
  ceiling.rotateX(Math.PI);
  group.add(ceiling);

  return group;
}

function hexShape(side: number): THREE.Shape {
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
