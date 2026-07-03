import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync, ping } from '../src/wasm/pkg/babel-gen.js';

// Node has no dev server to fetch the .wasm asset from, so the test loads
// the bytes itself and initializes synchronously. The facade in
// src/wasm/index.ts uses the default fetch-based init() for real browser
// builds (Vite rewrites the asset URL correctly there) and is exercised by
// the Playwright suite instead.
beforeAll(async () => {
  const wasmPath = resolve(process.cwd(), 'src/wasm/pkg/babel-gen_bg.wasm');
  const bytes = await readFile(wasmPath);
  initSync({ module: bytes });
});

describe('wasm boundary', () => {
  it('calls a typed export and gets a real number back', () => {
    const result = ping(21);
    expect(result).toBe(42);
  });
});
