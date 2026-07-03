use wasm_bindgen::prelude::*;

pub fn placeholder_ready() -> bool {
    true
}

/// Smoke-test export proving the wasm-bindgen toolchain and the JS<->wasm
/// boundary work end to end (see web/tests/wasm.test.ts).
#[wasm_bindgen]
pub fn ping(n: u32) -> u32 {
    n * 2
}
