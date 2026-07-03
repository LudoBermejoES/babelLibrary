// Smoke test for the wasm-bindgen export used by the frontend smoke test
// (web/tests/wasm.test.ts). Runs natively too, proving the function is
// plain, target-independent Rust underneath the wasm_bindgen attribute.
use babel_gen::ping;

#[test]
fn ping_returns_expected_value() {
    assert_eq!(ping(2), 4);
}
