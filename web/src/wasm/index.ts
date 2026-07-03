import init, { ping } from './pkg/babel-gen.js';

let ready: Promise<void> | undefined;

async function ensureReady(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

export async function smokeTestPing(n: number): Promise<number> {
  await ensureReady();
  return ping(n);
}
