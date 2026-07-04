use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod gen;
pub mod rng;

use gen::{emit, generate, Gallery, InputBook, Layout};

/// Smoke-test export proving the wasm-bindgen toolchain and the JS<->wasm
/// boundary work end to end (see web/tests/wasm.test.ts).
#[wasm_bindgen]
pub fn ping(n: u32) -> u32 {
    n * 2
}

/// The generated library, wasm-bindgen-facing. Construction is the only
/// place `InputBook`s are built from raw JS arrays; everything else
/// delegates to the pure `gen` module (doc 04's "Wasm API").
#[wasm_bindgen]
pub struct Library {
    layout: Layout,
}

#[wasm_bindgen]
impl Library {
    /// `book_ids`: catalog ids in display order (frontend pre-sorted by
    /// author/title/id). `color_hints`: 0xRRGGBB per book, `u32::MAX` means
    /// "no hint" — same length as `book_ids`.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64, book_ids: &[u32], color_hints: &[u32]) -> Library {
        let books: Vec<InputBook> = book_ids
            .iter()
            .zip(color_hints.iter())
            .map(|(&id, &hint)| InputBook {
                id,
                color_hint: if hint == u32::MAX { None } else { Some(hint) },
            })
            .collect();
        Library {
            layout: generate(seed, &books),
        }
    }

    pub fn gallery_count(&self) -> u32 {
        self.layout.galleries.len() as u32
    }

    fn gallery(&self, index: u32) -> &Gallery {
        &self.layout.galleries[index as usize]
    }

    /// Small JSON: world constants, galleries (3D-addressed), spawn point —
    /// see doc 04 "Wasm API" for the exact shape.
    pub fn graph_json(&self) -> String {
        serde_json::to_string(&GraphJson::from_layout(&self.layout))
            .expect("GraphJson serialization cannot fail: no non-finite floats, no cycles")
    }

    pub fn book_transforms(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::book_transforms(self.gallery(gallery)))
    }

    pub fn book_colors(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::book_colors(self.gallery(gallery)))
    }

    pub fn book_ids(&self, gallery: u32) -> js_sys::Uint32Array {
        to_u32_array(emit::book_ids(self.gallery(gallery)))
    }

    pub fn shelf_transforms(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::shelf_transforms(self.gallery(gallery)))
    }

    pub fn prop_transforms(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::prop_transforms(self.gallery(gallery)))
    }

    pub fn wall_segments(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::wall_segments(self.gallery(gallery)))
    }

    pub fn vestibule(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::vestibule(self.gallery(gallery)))
    }

    pub fn shaft_colliders(&self, gallery: u32) -> js_sys::Float32Array {
        to_f32_array(emit::shaft_colliders(self.gallery(gallery)))
    }

    pub fn colliders(&self, gallery: u32) -> js_sys::Float32Array {
        let walls = emit::wall_segments(self.gallery(gallery));
        let shelves = emit::shelf_transforms(self.gallery(gallery));
        to_f32_array(emit::colliders(&walls, &shelves))
    }
}

fn to_f32_array(v: Vec<f32>) -> js_sys::Float32Array {
    js_sys::Float32Array::from(v.as_slice())
}

fn to_u32_array(v: Vec<u32>) -> js_sys::Uint32Array {
    js_sys::Uint32Array::from(v.as_slice())
}

#[derive(Serialize)]
struct ConfigJson {
    hex_side: f32,
    ceiling_height: f32,
    shaft_radius: f32,
    staircase_radius: f32,
    railing_height: f32,
    books_per_hex: usize,
    slots_per_shelf: usize,
    shelves_per_wall: usize,
    shelf_walls_per_hex: usize,
    vestibule_opening: f32,
}

impl Default for ConfigJson {
    fn default() -> Self {
        ConfigJson {
            hex_side: gen::config::HEX_SIDE_M,
            ceiling_height: gen::config::CEILING_HEIGHT_M,
            shaft_radius: gen::config::SHAFT_RADIUS_M,
            staircase_radius: gen::config::STAIRCASE_RADIUS_M,
            railing_height: gen::config::RAILING_HEIGHT_M,
            books_per_hex: gen::config::BOOKS_PER_HEX,
            slots_per_shelf: gen::config::SLOTS_PER_SHELF,
            shelves_per_wall: gen::config::SHELVES_PER_WALL,
            shelf_walls_per_hex: gen::config::SHELF_WALLS_PER_HEX,
            vestibule_opening: gen::config::VESTIBULE_OPENING_M,
        }
    }
}

#[derive(Serialize)]
struct GalleryJson {
    index: usize,
    q: i32,
    r: i32,
    floor: i32,
    center: [f32; 3],
    horizontal_neighbor: Option<usize>,
    floor_above: Option<usize>,
    floor_below: Option<usize>,
}

#[derive(Serialize)]
struct SpawnJson {
    gallery: usize,
    position: [f32; 3],
    yaw: f32,
}

#[derive(Serialize)]
struct GraphJson {
    config: ConfigJson,
    galleries: Vec<GalleryJson>,
    spawn: SpawnJson,
}

impl GraphJson {
    fn from_layout(layout: &Layout) -> Self {
        let galleries = layout
            .galleries
            .iter()
            .enumerate()
            .map(|(index, g)| GalleryJson {
                index,
                q: g.q,
                r: g.r,
                floor: g.floor,
                center: {
                    let (x, y, z) = emit::hex_center(g);
                    [x, y, z]
                },
                horizontal_neighbor: g.horizontal_neighbor,
                floor_above: g.floor_above,
                floor_below: g.floor_below,
            })
            .collect();

        // Spawn is emitted at FLOOR level; the frontend adds eye height when
        // posing the camera (eye height is a player-feel value it owns —
        // web/src/controls/constants.ts EYE_HEIGHT — not world data).
        let (sx, sy, sz, yaw) = emit::spawn_pose(&layout.galleries[layout.spawn_gallery]);
        GraphJson {
            config: ConfigJson::default(),
            galleries,
            spawn: SpawnJson {
                gallery: layout.spawn_gallery,
                position: [sx, sy, sz],
                yaw,
            },
        }
    }
}
