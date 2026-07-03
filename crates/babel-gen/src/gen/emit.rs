//! Turns a `Gallery`'s abstract data (slots, vestibule flags, neighbors)
//! into the flat typed-array buffers the wasm facade hands to the frontend
//! — doc 04 "Buffer layouts (canonical)". Pure, native-testable geometry:
//! no wasm-bindgen types appear here, only `Vec<f32>`/`Vec<u32>`, matching
//! the crate's "everything under `gen/` compiles natively" rule.

use crate::gen::config;
use crate::gen::Gallery;

/// World-space center of a hex gallery, given its axial `(q, r)` and floor.
/// Flat-top hex layout: `x = side * 3/2 * q`, `z = side * sqrt(3) * (r + q/2)`.
pub fn hex_center(gallery: &Gallery) -> (f32, f32, f32) {
    let side = config::HEX_SIDE_M;
    let x = side * 1.5 * gallery.q as f32;
    let z = side * 3f32.sqrt() * (gallery.r as f32 + gallery.q as f32 / 2.0);
    let y = gallery.floor as f32 * config::CEILING_HEIGHT_M;
    (x, y, z)
}

/// The 6 wall-midpoint directions of a flat-top hexagon, in a fixed order
/// matching `HEX_DIRECTIONS` in `graph.rs` conceptually (wall `i` faces
/// direction `i`). Angle 0 points toward `+x`.
fn wall_normal(index: usize) -> (f32, f32) {
    let angle = wall_yaw(index);
    (angle.cos(), angle.sin())
}

/// Yaw angle (radians) of wall `index`, matching `wall_normal`'s direction
/// order. Shared by every call site that orients geometry to a wall.
fn wall_yaw(index: usize) -> f32 {
    std::f32::consts::PI / 3.0 * index as f32
}

/// Column-major 4x4 identity-rotated translation matrix (no rotation, just
/// position) — used where a full rotation isn't yet needed. Column-major to
/// match `InstancedMesh.instanceMatrix`'s expected layout directly.
fn translation_matrix(pos: (f32, f32, f32)) -> [f32; 16] {
    let (x, y, z) = pos;
    #[rustfmt::skip]
    let m = [
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        x,   y,   z,   1.0,
    ];
    m
}

/// Column-major 4x4 matrix: rotation about Y by `yaw` radians, then
/// translation, then non-uniform scale applied before rotation (so `scale`
/// is in the object's local axes).
fn transform_matrix(pos: (f32, f32, f32), yaw: f32, scale: (f32, f32, f32)) -> [f32; 16] {
    let (sx, sy, sz) = scale;
    let (c, s) = (yaw.cos(), yaw.sin());
    let (x, y, z) = pos;
    // Column-major: columns are the transformed basis vectors, then translation.
    #[rustfmt::skip]
    let m = [
        c * sx,  0.0, -s * sx, 0.0,
        0.0,     sy,  0.0,     0.0,
        s * sz,  0.0, c * sz,  0.0,
        x,       y,   z,       1.0,
    ];
    m
}

/// Book spine transforms for every placed book in this gallery, in slot
/// order. 16 f32 per instance (doc 04).
pub fn book_transforms(gallery: &Gallery) -> Vec<f32> {
    let (cx, cy, cz) = hex_center(gallery);
    let mut out = Vec::new();

    for (slot_index, placed) in gallery
        .slots
        .iter()
        .enumerate()
        .filter_map(|(i, s)| s.map(|p| (i, p)))
    {
        let (wall_index, row, col) = slot_location(slot_index);
        let (wx, wz) = wall_normal(wall_index);
        let bay_width = config::SHELF_BAY_WIDTH_M;
        let slot_pitch = config::SLOT_PITCH_M;
        // Position along the wall, centered on the bay.
        let along = (col as f32 + 0.5) * slot_pitch - bay_width / 2.0;
        // Wall tangent (perpendicular to the outward normal, in-plane).
        let (tx, tz) = (-wz, wx);
        let row_height = 0.55;
        let first_row_bottom = 0.30;
        let (w, h, d) = placed.dims;
        let wall_distance = hex_apothem();

        let px = cx + wx * wall_distance + tx * along;
        let pz = cz + wz * wall_distance + tz * along;
        let py = cy + first_row_bottom + row as f32 * row_height + h / 2.0;

        let yaw = wall_yaw(wall_index);
        out.extend_from_slice(&transform_matrix((px, py, pz), yaw, (w, h, d)));
    }

    out
}

/// Book colors, index-aligned with `book_transforms`. 3 f32 per instance.
pub fn book_colors(gallery: &Gallery) -> Vec<f32> {
    gallery
        .slots
        .iter()
        .flatten()
        .flat_map(|p| [p.color.0, p.color.1, p.color.2])
        .collect()
}

/// Book catalog ids, index-aligned with `book_transforms`/`book_colors`.
pub fn book_ids(gallery: &Gallery) -> Vec<u32> {
    gallery.slots.iter().flatten().map(|p| p.book_id).collect()
}

/// One matrix per shelf bay, always `SHELF_WALLS_PER_HEX` bays (doc 04).
pub fn shelf_transforms(gallery: &Gallery) -> Vec<f32> {
    let (cx, cy, cz) = hex_center(gallery);
    let mut out = Vec::with_capacity(config::SHELF_WALLS_PER_HEX * 16);
    let wall_distance = hex_apothem();

    for wall_index in shelf_wall_indices(gallery) {
        let (wx, wz) = wall_normal(wall_index);
        let px = cx + wx * wall_distance;
        let pz = cz + wz * wall_distance;
        let yaw = wall_yaw(wall_index);
        out.extend_from_slice(&transform_matrix((px, cy, pz), yaw, (1.0, 1.0, 1.0)));
    }

    out
}

/// Prop transforms (lamps + tables), `[kind, m0..m15]` per doc 04. Always
/// `LAMPS_PER_HEX` lamps (kind 1), placed crosswise; tables (kind 0) are
/// not generated in this task (0 in v1 — task 3.5 scope is lamps + shelves;
/// tables are a later polish item per doc 04 "0-2 tables (seeded)").
pub fn prop_transforms(gallery: &Gallery) -> Vec<f32> {
    let (cx, cy, cz) = hex_center(gallery);
    let mut out = Vec::with_capacity(config::LAMPS_PER_HEX * 17);
    let lamp_radius = hex_apothem() * 0.6;

    // Crosswise: opposite corners of the hexagon, i.e. offset by 3 wall
    // indices (half of 6) from each other, at a corner angle (30 deg offset
    // from a wall normal) rather than a wall midpoint.
    for lamp_index in 0..config::LAMPS_PER_HEX {
        let corner_index = lamp_index * 3; // crosswise: opposite corners
        let angle = std::f32::consts::PI / 3.0 * corner_index as f32 + std::f32::consts::PI / 6.0;
        let px = cx + angle.cos() * lamp_radius;
        let pz = cz + angle.sin() * lamp_radius;
        let py = cy + config::CEILING_HEIGHT_M - 0.2;

        out.push(1.0); // kind: lamp
        out.extend_from_slice(&translation_matrix((px, py, pz)));
    }

    out
}

/// `[x1,z1,x2,z2,height,kind,doorCenter,doorWidth]` per wall, 4 shelf walls
/// (kind 0) + 1 vestibule opening (kind 1) = 5 records (doc 04). The shaft
/// wall is not a `wall_segments` entry (see `shaft_colliders`).
pub fn wall_segments(gallery: &Gallery) -> Vec<f32> {
    let (cx, _cy, cz) = hex_center(gallery);
    let side = config::HEX_SIDE_M;
    let apothem = hex_apothem();
    let vestibule_wall = vestibule_wall_index(gallery);
    let shaft_wall = shaft_wall_index(gallery);

    let mut out = Vec::with_capacity(5 * 8);
    for wall_index in 0..6 {
        if wall_index == shaft_wall {
            continue; // shaft wall: not a wall_segments entry
        }
        let (nx, nz) = wall_normal(wall_index);
        // Wall tangent direction, wall runs from -side/2 to +side/2 along it.
        let (tx, tz) = (-nz, nx);
        let (mx, mz) = (cx + nx * apothem, cz + nz * apothem);
        let x1 = mx - tx * side / 2.0;
        let z1 = mz - tz * side / 2.0;
        let x2 = mx + tx * side / 2.0;
        let z2 = mz + tz * side / 2.0;

        let is_vestibule = wall_index == vestibule_wall;
        let kind = if is_vestibule { 1.0 } else { 0.0 };
        let (door_center, door_width) = if is_vestibule {
            (0.0, config::VESTIBULE_OPENING_M)
        } else {
            (0.0, 0.0)
        };

        out.extend_from_slice(&[
            x1,
            z1,
            x2,
            z2,
            config::CEILING_HEIGHT_M,
            kind,
            door_center,
            door_width,
        ]);
    }

    out
}

/// Fixed 25-f32 vestibule record (doc 04): `[hasStairUp, hasStairDown,
/// hasHorizontalNeighbor, mirrorTransform(16), closetLeftPos(3),
/// closetRightPos(3)]`.
pub fn vestibule(gallery: &Gallery) -> Vec<f32> {
    let (cx, cy, cz) = hex_center(gallery);
    let vestibule_wall = vestibule_wall_index(gallery);
    let (nx, nz) = wall_normal(vestibule_wall);
    let apothem = hex_apothem();
    let vestibule_depth = 2.0; // doc 04: 2.0 m x 1.5 m antechamber

    // Mirror sits at the far end of the vestibule, facing back into the hexagon.
    let mirror_pos = (
        cx + nx * (apothem + vestibule_depth),
        cy + config::CEILING_HEIGHT_M / 2.0,
        cz + nz * (apothem + vestibule_depth),
    );
    let mirror_yaw = wall_yaw(vestibule_wall) + std::f32::consts::PI;
    let mirror_transform = transform_matrix(mirror_pos, mirror_yaw, (1.2, 2.0, 0.02));

    let (tx, tz) = (-nz, nx);
    let closet_offset = 0.6;
    let mid_pos = (
        cx + nx * (apothem + vestibule_depth / 2.0),
        cy,
        cz + nz * (apothem + vestibule_depth / 2.0),
    );
    let closet_left = (
        mid_pos.0 - tx * closet_offset,
        mid_pos.1,
        mid_pos.2 - tz * closet_offset,
    );
    let closet_right = (
        mid_pos.0 + tx * closet_offset,
        mid_pos.1,
        mid_pos.2 + tz * closet_offset,
    );

    let mut out = Vec::with_capacity(25);
    out.push(if gallery.vestibule.has_stair_up {
        1.0
    } else {
        0.0
    });
    out.push(if gallery.vestibule.has_stair_down {
        1.0
    } else {
        0.0
    });
    out.push(if gallery.vestibule.has_horizontal_doorway {
        1.0
    } else {
        0.0
    });
    out.extend_from_slice(&mirror_transform);
    out.extend_from_slice(&[closet_left.0, closet_left.1, closet_left.2]);
    out.extend_from_slice(&[closet_right.0, closet_right.1, closet_right.2]);
    out
}

/// AABB colliders forming the central shaft's railing ring, approximated as
/// a hexagonal ring of small boxes (same "staircase of boxes" technique
/// used for curved/hex walls, doc 06).
pub fn shaft_colliders(gallery: &Gallery) -> Vec<f32> {
    let (cx, cy, cz) = hex_center(gallery);
    let radius = config::SHAFT_RADIUS_M;
    let railing_height = config::RAILING_HEIGHT_M;
    let segments = 12;
    let box_half_thickness = 0.05;

    let mut out = Vec::with_capacity(segments * 6);
    for i in 0..segments {
        let angle = std::f32::consts::TAU * i as f32 / segments as f32;
        let (sx, sz) = (angle.cos() * radius, angle.sin() * radius);
        let min = (
            cx + sx - box_half_thickness,
            cy,
            cz + sz - box_half_thickness,
        );
        let max = (
            cx + sx + box_half_thickness,
            cy + railing_height,
            cz + sz + box_half_thickness,
        );
        out.extend_from_slice(&[min.0, min.1, min.2, max.0, max.1, max.2]);
    }
    out
}

/// General static colliders: shelf-wall pieces (with vestibule-opening
/// flanks + lintel) and shelf-bay boxes. Tables are not emitted in this
/// task (see `prop_transforms`). Takes the gallery's already-computed
/// `wall_segments`/`shelf_transforms` buffers rather than recomputing them,
/// since callers (the wasm facade) also expose those as separate buffers.
pub fn colliders(walls: &[f32], shelves: &[f32]) -> Vec<f32> {
    let mut out = Vec::new();
    let wall_thickness = 0.15;

    for record in walls.chunks_exact(8) {
        let [x1, z1, x2, z2, height, kind, _door_center, door_width] = record else {
            unreachable!()
        };
        let is_vestibule = *kind == 1.0;
        let (min_x, max_x) = (x1.min(*x2), x1.max(*x2));
        let (min_z, max_z) = (z1.min(*z2), z1.max(*z2));

        if !is_vestibule {
            out.extend_from_slice(&aabb_from_segment(
                (min_x, min_z),
                (max_x, max_z),
                wall_thickness,
                *height,
            ));
        } else {
            // Two flanking boxes around the opening + a lintel above it.
            let along_len = ((max_x - min_x).powi(2) + (max_z - min_z).powi(2)).sqrt();
            let half_open = door_width / 2.0;
            let flank_len = (along_len / 2.0 - half_open).max(0.0);
            if flank_len > 0.0 {
                let dir = (
                    (x2 - x1) / along_len.max(1e-6),
                    (z2 - z1) / along_len.max(1e-6),
                );
                let flank_a_end = (x1 + dir.0 * flank_len, z1 + dir.1 * flank_len);
                let flank_b_start = (x2 - dir.0 * flank_len, z2 - dir.1 * flank_len);
                out.extend_from_slice(&aabb_from_segment(
                    (*x1, *z1),
                    flank_a_end,
                    wall_thickness,
                    *height,
                ));
                out.extend_from_slice(&aabb_from_segment(
                    flank_b_start,
                    (*x2, *z2),
                    wall_thickness,
                    *height,
                ));
            }
            // Lintel: a box across the full wall width, spanning only the
            // top of the opening (from lintel_bottom to the ceiling) so the
            // doorway itself stays clear below it.
            let lintel_bottom = (*height - 0.4).max(0.0);
            out.extend_from_slice(&[
                min_x - wall_thickness,
                lintel_bottom,
                min_z - wall_thickness,
                max_x + wall_thickness,
                *height,
                max_z + wall_thickness,
            ]);
        }
    }

    for shelf_matrix in shelves.chunks_exact(16) {
        let (px, py, pz) = (shelf_matrix[12], shelf_matrix[13], shelf_matrix[14]);
        let half = (0.2, config::CEILING_HEIGHT_M / 2.0, 0.2);
        out.extend_from_slice(&[
            px - half.0,
            py,
            pz - half.2,
            px + half.0,
            py + half.1 * 2.0,
            pz + half.2,
        ]);
    }

    out
}

fn aabb_from_segment(a: (f32, f32), b: (f32, f32), thickness: f32, height: f32) -> [f32; 6] {
    let min_x = a.0.min(b.0) - thickness;
    let max_x = a.0.max(b.0) + thickness;
    let min_z = a.1.min(b.1) - thickness;
    let max_z = a.1.max(b.1) + thickness;
    [min_x, 0.0, min_z, max_x, height, max_z]
}

/// Distance from a flat-top hexagon's center to the midpoint of a wall.
fn hex_apothem() -> f32 {
    config::HEX_SIDE_M * 3f32.sqrt() / 2.0
}

/// Which of the 6 walls (0..6) is this gallery's vestibule. Deterministic:
/// always wall 0 relative to whichever wall its `horizontal_neighbor` graph
/// edge conceptually uses — since the graph doesn't track a specific wall
/// index (any wall could serve; the shape is fixed, not the orientation),
/// we fix vestibule = wall 0 and shaft-adjacent wall = wall 3 (opposite)
/// for every gallery, keeping the 4 remaining walls (1,2,4,5) as shelf
/// walls. This is a legitimate free choice: doc 04 fixes *how many* walls
/// serve each role, not *which* wall index — orientation has no gameplay
/// or fidelity consequence.
fn vestibule_wall_index(_gallery: &Gallery) -> usize {
    0
}

fn shaft_wall_index(_gallery: &Gallery) -> usize {
    3
}

fn shelf_wall_indices(gallery: &Gallery) -> [usize; 4] {
    let v = vestibule_wall_index(gallery);
    let s = shaft_wall_index(gallery);
    let mut walls = [0usize; 4];
    let mut i = 0;
    for w in 0..6 {
        if w != v && w != s {
            walls[i] = w;
            i += 1;
        }
    }
    walls
}

/// Maps a flat slot index (0..BOOKS_PER_HEX) to (wall_index, row, col)
/// within the fixed shelf layout: shelf-wall 0..SHELF_WALLS_PER_HEX, row
/// 0..SHELVES_PER_WALL, col 0..SLOTS_PER_SHELF — matching the traversal
/// order in `furnish.rs`.
fn slot_location(slot_index: usize) -> (usize, usize, usize) {
    let per_wall = config::SHELVES_PER_WALL * config::SLOTS_PER_SHELF;
    let wall = slot_index / per_wall;
    let within_wall = slot_index % per_wall;
    let row = within_wall / config::SLOTS_PER_SHELF;
    let col = within_wall % config::SLOTS_PER_SHELF;
    (wall, row, col)
}
