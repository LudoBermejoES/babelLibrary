//! Property-based tests (task 3.6): the invariants asserted by hand in
//! `tests/determinism.rs` for a handful of fixed (seed, catalog) pairs must
//! hold across a wide, randomly-sampled range of both.

use std::collections::HashSet;

use babel_gen::gen::{generate, InputBook};
use proptest::prelude::*;

fn fake_books(n: usize) -> Vec<InputBook> {
    (0..n as u32)
        .map(|id| InputBook {
            id,
            color_hint: None,
        })
        .collect()
}

proptest! {
    #[test]
    fn placement_is_total_and_unique(seed in any::<u64>(), book_count in 0usize..=3000) {
        let books = fake_books(book_count);
        let layout = generate(seed, &books);

        let mut seen = HashSet::new();
        for gallery in &layout.galleries {
            for placed in gallery.slots.iter().flatten() {
                prop_assert!(seen.insert(placed.book_id), "book {} placed more than once", placed.book_id);
            }
        }
        prop_assert_eq!(seen.len(), books.len(), "every input book must be placed exactly once");
    }

    #[test]
    fn placement_is_in_bounds(seed in any::<u64>(), book_count in 0usize..=1000) {
        let books = fake_books(book_count);
        let layout = generate(seed, &books);

        for gallery in &layout.galleries {
            for placed in gallery.slots.iter().flatten() {
                let (w, h, d) = placed.dims;
                prop_assert!((0.030..=0.060).contains(&w));
                prop_assert!((0.180..=0.260).contains(&h));
                prop_assert!((0.120..=0.160).contains(&d));
                let (r, g, b) = placed.color;
                prop_assert!((0.0..=1.0).contains(&r));
                prop_assert!((0.0..=1.0).contains(&g));
                prop_assert!((0.0..=1.0).contains(&b));
            }
        }
    }

    #[test]
    fn vertical_alignment_holds(seed in any::<u64>(), book_count in 0usize..=5000) {
        let books = fake_books(book_count);
        let layout = generate(seed, &books);

        for gallery in &layout.galleries {
            if let Some(above_idx) = gallery.floor_above {
                let above = &layout.galleries[above_idx];
                prop_assert_eq!(above.q, gallery.q);
                prop_assert_eq!(above.r, gallery.r);
                prop_assert_eq!(above.floor, gallery.floor + 1);
            }
            if let Some(below_idx) = gallery.floor_below {
                let below = &layout.galleries[below_idx];
                prop_assert_eq!(below.q, gallery.q);
                prop_assert_eq!(below.r, gallery.r);
                prop_assert_eq!(below.floor, gallery.floor - 1);
            }
        }
    }

    #[test]
    fn same_seed_same_catalog_is_deterministic(seed in any::<u64>(), book_count in 0usize..=500) {
        let books = fake_books(book_count);
        let a = generate(seed, &books);
        let b = generate(seed, &books);
        prop_assert_eq!(a, b);
    }

    #[test]
    fn gallery_shape_is_always_fixed(seed in any::<u64>(), book_count in 0usize..=2000) {
        let books = fake_books(book_count);
        let layout = generate(seed, &books);
        for gallery in &layout.galleries {
            prop_assert_eq!(gallery.slot_count(), babel_gen::gen::config::BOOKS_PER_HEX);
        }
    }
}
