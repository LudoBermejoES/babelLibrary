//! Buffer-emission tests (task 3.5, doc 04 "Buffer layouts (canonical)").
//! Asserts stride/length/alignment of every flat buffer the wasm facade
//! will hand to the frontend — native, no wasm involved.

use babel_gen::gen::config;
use babel_gen::gen::emit;
use babel_gen::gen::{generate, InputBook};

fn fake_books(n: usize) -> Vec<InputBook> {
    (0..n as u32)
        .map(|id| InputBook {
            id,
            color_hint: None,
        })
        .collect()
}

#[test]
fn book_buffers_are_index_aligned_and_strided() {
    let books = fake_books(200);
    let layout = generate(1, &books);

    for (i, gallery) in layout.galleries.iter().enumerate() {
        let transforms = emit::book_transforms(gallery);
        let colors = emit::book_colors(gallery);
        let ids = emit::book_ids(gallery);

        let placed_count = gallery.slots.iter().flatten().count();
        assert_eq!(
            transforms.len(),
            placed_count * 16,
            "gallery {i}: book_transforms must be 16 f32 per placed book"
        );
        assert_eq!(
            colors.len(),
            placed_count * 3,
            "gallery {i}: book_colors must be 3 f32 per placed book"
        );
        assert_eq!(
            ids.len(),
            placed_count,
            "gallery {i}: book_ids must be 1 u32 per placed book"
        );

        // Index-aligned: ids[k] must be the book placed in the k-th
        // occupied slot, in slot order.
        let expected_ids: Vec<u32> = gallery.slots.iter().flatten().map(|p| p.book_id).collect();
        assert_eq!(ids, expected_ids, "gallery {i}: book_ids must be index-aligned with book_transforms/book_colors in slot order");
    }
}

#[test]
fn shelf_and_prop_counts_are_fixed_every_gallery() {
    let books = fake_books(500);
    let layout = generate(2, &books);

    for (i, gallery) in layout.galleries.iter().enumerate() {
        let shelf_transforms = emit::shelf_transforms(gallery);
        let prop_transforms = emit::prop_transforms(gallery);

        assert_eq!(
            shelf_transforms.len(),
            config::SHELF_WALLS_PER_HEX * 16,
            "gallery {i}: shelf_transforms must be 16 f32 per shelf bay, always SHELF_WALLS_PER_HEX bays"
        );
        assert_eq!(
            prop_transforms.len(),
            config::LAMPS_PER_HEX * 17,
            "gallery {i}: prop_transforms must be 17 f32 per prop; lamps are the only always-present prop"
        );
        // kind field (index 0 of each 17-wide record) must be 1 (lamp) for
        // every entry, since tables are 0..=2 and not asserted as present.
        for lamp_idx in 0..config::LAMPS_PER_HEX {
            assert_eq!(prop_transforms[lamp_idx * 17], 1.0, "lamp kind must be 1");
        }
    }
}

#[test]
fn wall_segments_cover_all_six_walls() {
    let books = fake_books(50);
    let layout = generate(3, &books);

    for (i, gallery) in layout.galleries.iter().enumerate() {
        let walls = emit::wall_segments(gallery);
        assert_eq!(
            walls.len() % 8,
            0,
            "gallery {i}: wall_segments must be a whole number of 8-f32 records"
        );
        let record_count = walls.len() / 8;
        // 4 shelf walls (kind 0) + 1 vestibule opening (kind 1). The shaft
        // wall isn't a `wall_segments` entry (it's the central shaft, a
        // separate buffer) so exactly 5 records per gallery.
        assert_eq!(
            record_count, 5,
            "gallery {i}: expected 4 shelf walls + 1 vestibule opening"
        );
        let kind_1_count = (0..record_count)
            .filter(|&r| walls[r * 8 + 5] == 1.0)
            .count();
        assert_eq!(
            kind_1_count, 1,
            "gallery {i}: exactly one vestibule-opening wall segment"
        );
    }
}

#[test]
fn vestibule_record_is_fixed_length_and_reflects_neighbors() {
    let books = fake_books(2500); // force multiple floors so some galleries have stairs
    let layout = generate(4, &books);

    for (i, gallery) in layout.galleries.iter().enumerate() {
        let record = emit::vestibule(gallery);
        assert_eq!(
            record.len(),
            25,
            "gallery {i}: vestibule record must be exactly 3 + 16 + 3 + 3 = 25 f32 (doc 04 layout)"
        );

        let has_stair_up = record[0] != 0.0;
        let has_stair_down = record[1] != 0.0;
        let has_horizontal = record[2] != 0.0;

        assert_eq!(has_stair_up, gallery.vestibule.has_stair_up);
        assert_eq!(has_stair_down, gallery.vestibule.has_stair_down);
        assert_eq!(has_horizontal, gallery.vestibule.has_horizontal_doorway);
    }
}

#[test]
fn shaft_colliders_are_valid_aabbs() {
    let books = fake_books(50);
    let layout = generate(5, &books);

    for (i, gallery) in layout.galleries.iter().enumerate() {
        let shaft = emit::shaft_colliders(gallery);
        assert_eq!(
            shaft.len() % 6,
            0,
            "gallery {i}: shaft_colliders must be whole 6-f32 AABB records"
        );
        assert!(
            !shaft.is_empty(),
            "gallery {i}: shaft railing must emit at least one collider box"
        );
        for chunk in shaft.chunks_exact(6) {
            assert!(chunk[0] < chunk[3], "minX must be < maxX");
            assert!(chunk[1] < chunk[4], "minY must be < maxY");
            assert!(chunk[2] < chunk[5], "minZ must be < maxZ");
        }
    }
}

#[test]
fn colliders_are_valid_aabbs_and_cover_shelves_and_walls() {
    let books = fake_books(50);
    let layout = generate(6, &books);

    for (i, gallery) in layout.galleries.iter().enumerate() {
        let walls = emit::wall_segments(gallery);
        let shelves = emit::shelf_transforms(gallery);
        let colliders = emit::colliders(&walls, &shelves);
        assert_eq!(
            colliders.len() % 6,
            0,
            "gallery {i}: colliders must be whole 6-f32 AABB records"
        );
        assert!(
            !colliders.is_empty(),
            "gallery {i}: shelf walls and shelf bays must produce at least one collider"
        );
        for chunk in colliders.chunks_exact(6) {
            assert!(chunk[0] < chunk[3], "minX must be < maxX");
            assert!(chunk[1] < chunk[4], "minY must be < maxY");
            assert!(chunk[2] < chunk[5], "minZ must be < maxZ");
        }
    }
}

#[test]
fn vestibule_opening_clearance_from_real_colliders() {
    // Real version of the placeholder in tests/determinism.rs: the two
    // flanking AABBs around a vestibule opening must leave >= 0.9 m clear.
    let books = fake_books(50);
    let layout = generate(7, &books);

    for gallery in &layout.galleries {
        let walls = emit::wall_segments(gallery);
        for record in walls.chunks_exact(8) {
            let kind = record[5];
            if kind == 1.0 {
                let door_width = record[7];
                assert!(
                    door_width >= 0.9,
                    "vestibule opening width {door_width} must be >= 0.9 m"
                );
            }
        }
    }
}
