//! Native determinism suite for the generator (doc 04 "Native test suite").
//! Runs with plain `cargo test` — no wasm involved. Every test here is
//! written before `gen::graph`/`gen::furnish`/`gen::assign` have real
//! implementations (they currently `todo!()`), so this file starts RED by
//! construction and turns GREEN as tasks 3.2-3.4 land.

use babel_gen::gen::config;
use babel_gen::gen::{generate, InputBook};
use std::collections::{HashSet, VecDeque};

fn fake_books(n: usize) -> Vec<InputBook> {
    (0..n as u32)
        .map(|id| InputBook {
            id,
            color_hint: None,
        })
        .collect()
}

#[test]
fn same_inputs_same_layout() {
    let books = fake_books(500);
    let a = generate(42, &books);
    let b = generate(42, &books);
    assert_eq!(
        a, b,
        "same (seed, catalog) must produce an identical layout"
    );
}

#[test]
fn all_books_placed_once() {
    let books = fake_books(347);
    let layout = generate(7, &books);

    let mut seen = HashSet::new();
    for gallery in &layout.galleries {
        for placed in gallery.slots.iter().flatten() {
            assert!(
                seen.insert(placed.book_id),
                "book {} placed more than once",
                placed.book_id
            );
        }
    }
    assert_eq!(
        seen.len(),
        books.len(),
        "every input book must appear exactly once"
    );
    for book in &books {
        assert!(seen.contains(&book.id), "book {} was never placed", book.id);
    }
}

#[test]
fn different_seeds_differ() {
    let books = fake_books(300);
    let a = generate(1, &books);
    let b = generate(2, &books);
    assert_ne!(a, b, "different seeds must produce different layouts");
}

#[test]
fn catalog_hint_wins() {
    let mut books = fake_books(10);
    books[3].color_hint = Some(0x336699);
    let layout = generate(99, &books);

    let placed = layout
        .galleries
        .iter()
        .flat_map(|g| g.slots.iter())
        .flatten()
        .find(|p| p.book_id == 3)
        .expect("book 3 must be placed");

    let expected = (
        0x33 as f32 / 255.0,
        0x66 as f32 / 255.0,
        0x99 as f32 / 255.0,
    );
    let (r, g, b) = placed.color;
    let close = |a: f32, b: f32| (a - b).abs() < 1e-3;
    assert!(
        close(r, expected.0) && close(g, expected.1) && close(b, expected.2),
        "catalog color hint must win over a derived color, got {:?}",
        placed.color
    );
}

#[test]
fn spine_bounds() {
    let books = fake_books(400);
    let layout = generate(5, &books);

    for gallery in &layout.galleries {
        for slot in gallery.slots.iter().flatten() {
            let (w, h, d) = slot.dims;
            assert!(
                (0.030..=0.060).contains(&w),
                "spine width {w} out of bounds"
            );
            assert!(
                (0.180..=0.260).contains(&h),
                "spine height {h} out of bounds"
            );
            assert!(
                (0.120..=0.160).contains(&d),
                "spine depth {d} out of bounds"
            );
        }
    }
}

#[test]
fn fixed_hexagon_shape() {
    let books = fake_books(1000);
    let layout = generate(11, &books);

    assert!(!layout.galleries.is_empty());
    for gallery in &layout.galleries {
        assert_eq!(
            gallery.slot_count(),
            config::BOOKS_PER_HEX,
            "every gallery must have exactly config::BOOKS_PER_HEX slots, regardless of position"
        );
    }
}

#[test]
fn shelf_capacity_matches_config() {
    for n in [
        0usize,
        1,
        50,
        config::BOOKS_PER_HEX,
        config::BOOKS_PER_HEX + 1,
    ] {
        let expected = n.div_ceil(config::BOOKS_PER_HEX).max(1);
        assert_eq!(
            config::galleries_needed(n),
            expected,
            "galleries needed for {n} books"
        );
    }
}

#[test]
fn graph_connected_across_floors() {
    let books = fake_books(2500); // large enough to force multiple floors
    let layout = generate(21, &books);

    let mut visited = vec![false; layout.galleries.len()];
    let mut queue = VecDeque::new();
    queue.push_back(layout.spawn_gallery);
    visited[layout.spawn_gallery] = true;

    while let Some(i) = queue.pop_front() {
        let gallery = &layout.galleries[i];
        for next in [
            gallery.horizontal_neighbor,
            gallery.floor_above,
            gallery.floor_below,
        ]
        .into_iter()
        .flatten()
        {
            if !visited[next] {
                visited[next] = true;
                queue.push_back(next);
            }
        }
    }

    let unreached: Vec<usize> = visited
        .iter()
        .enumerate()
        .filter(|(_, &v)| !v)
        .map(|(i, _)| i)
        .collect();
    assert!(
        unreached.is_empty(),
        "galleries unreachable from spawn: {unreached:?}"
    );
}

#[test]
fn floors_align_vertically() {
    let books = fake_books(2500);
    let layout = generate(22, &books);

    for gallery in &layout.galleries {
        if let Some(above_idx) = gallery.floor_above {
            let above = &layout.galleries[above_idx];
            assert_eq!(above.q, gallery.q, "floor-above must share q");
            assert_eq!(above.r, gallery.r, "floor-above must share r");
            assert_eq!(above.floor, gallery.floor + 1);
            assert!(
                above.vestibule.has_stair_down,
                "the gallery above must report a stair down back to this one"
            );
        }
        assert_eq!(
            gallery.vestibule.has_stair_up,
            gallery.floor_above.is_some(),
            "vestibule stair-up flag must match whether a floor-above gallery actually exists"
        );
        assert_eq!(
            gallery.vestibule.has_stair_down,
            gallery.floor_below.is_some(),
            "vestibule stair-down flag must match whether a floor-below gallery actually exists"
        );
    }
}

#[test]
fn floor_fills_before_next_floor_starts() {
    // A catalog just over one floor's minimum should not spill to floor 1
    // until floor 0 has reached its target size.
    let small_books = fake_books(config::BOOKS_PER_HEX * 2);
    let layout = generate(23, &small_books);
    let floor0_count = layout.galleries.iter().filter(|g| g.floor == 0).count();
    let floor1_count = layout.galleries.iter().filter(|g| g.floor == 1).count();

    if floor1_count > 0 {
        assert!(
            floor0_count >= config::FLOOR0_MIN_GALLERIES,
            "floor 1 must not start until floor 0 reaches its target size"
        );
    }
}

#[test]
fn min_galleries_on_floor_zero() {
    let books = fake_books(10);
    let layout = generate(24, &books);
    let floor0_count = layout.galleries.iter().filter(|g| g.floor == 0).count();
    assert!(
        floor0_count >= config::FLOOR0_MIN_GALLERIES,
        "a small catalog must still yield at least {} galleries on floor 0, got {floor0_count}",
        config::FLOOR0_MIN_GALLERIES
    );

    let floor1_exists = layout.galleries.iter().any(|g| g.floor == 1);
    assert!(
        !floor1_exists,
        "a 10-book catalog must not need a second floor"
    );
}

// The real vestibule-opening clearance check (against actual collider
// AABBs) lives in tests/buffers.rs::vestibule_opening_clearance_from_real_colliders,
// now that task 3.5's buffer emission exists.
