import { describe, expect, it } from 'vitest';
import { placeholderReady } from '../src/main';

describe('test harness', () => {
  it('runs', () => {
    expect(placeholderReady()).toBe(true);
  });
});
