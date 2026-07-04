//! Fixed per-gallery furnishing: shelves are implicit in `Gallery::slots`
//! (see `mod.rs`), but the vestibule (mirror, closets, staircase flags) and
//! book-to-slot assignment happen here, turning `GalleryShell`s into full
//! `Gallery`s.

use crate::gen::assign::presentation_for;
use crate::gen::config;
use crate::gen::graph::GalleryShell;
use crate::gen::{Gallery, InputBook, Layout, PlacedBook};

/// A gallery's vestibule: always present, always containing a mirror and
/// two closets. The doorway/staircase flags reflect whether a real neighbor
/// exists in the layout — see doc 04's "Vestibule and staircase
/// connectivity" requirement.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vestibule {
    pub has_horizontal_doorway: bool,
    pub has_stair_up: bool,
    pub has_stair_down: bool,
}

impl Vestibule {
    fn from_shell(shell: &GalleryShell) -> Self {
        Vestibule {
            has_horizontal_doorway: shell.horizontal_neighbor.is_some(),
            has_stair_up: shell.floor_above.is_some(),
            has_stair_down: shell.floor_below.is_some(),
        }
    }
}

/// Turns gallery shells + the ordered catalog into a full `Layout`: fixed
/// vestibule per shell, fixed-size slot vector per shell (always
/// `config::BOOKS_PER_HEX` long), books assigned in traversal order (floor
/// ascending, shell creation order within a floor — i.e. `shells`' own
/// order, since `graph::build_graph` already emits floor 0 before floor 1
/// etc. — then slot 0.. within each gallery).
pub fn furnish(seed: u64, shells: Vec<GalleryShell>, books: &[InputBook]) -> Layout {
    let mut galleries: Vec<Gallery> = shells
        .iter()
        .map(|shell| Gallery {
            q: shell.q,
            r: shell.r,
            floor: shell.floor,
            horizontal_neighbor: shell.horizontal_neighbor,
            vestibule_direction: shell.vestibule_direction,
            floor_above: shell.floor_above,
            floor_below: shell.floor_below,
            vestibule: Vestibule::from_shell(shell),
            slots: vec![None; config::BOOKS_PER_HEX],
        })
        .collect();

    let mut books_iter = books.iter();
    'fill: for gallery in galleries.iter_mut() {
        for slot in gallery.slots.iter_mut() {
            let Some(book) = books_iter.next() else {
                break 'fill;
            };
            let (dims, color) = presentation_for(seed, book.id, book.color_hint);
            *slot = Some(PlacedBook {
                book_id: book.id,
                dims,
                color,
            });
        }
    }

    Layout {
        galleries,
        spawn_gallery: 0,
    }
}
