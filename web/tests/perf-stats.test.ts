import { describe, expect, it } from 'vitest';
import { FpsTracker } from '../src/scene/perf-stats';

describe('FpsTracker', () => {
  it('reports no minimum before any samples are recorded', () => {
    const tracker = new FpsTracker();
    expect(tracker.min()).toBeNull();
  });

  it('computes instantaneous FPS from consecutive frame timestamps', () => {
    const tracker = new FpsTracker();
    tracker.recordFrame(0);
    tracker.recordFrame(1000 / 60); // one frame later at 60fps
    tracker.recordFrame((1000 / 60) * 2);
    // All frames evenly spaced at 60fps — min should be ~60.
    expect(tracker.min()).not.toBeNull();
    expect(tracker.min()!).toBeGreaterThan(55);
    expect(tracker.min()!).toBeLessThan(65);
  });

  it('tracks the minimum across a mix of fast and slow frames', () => {
    const tracker = new FpsTracker();
    let t = 0;
    for (let i = 0; i < 5; i++) {
      t += 1000 / 60; // 60fps frames
      tracker.recordFrame(t);
    }
    t += 1000 / 20; // one slow 20fps frame
    tracker.recordFrame(t);
    for (let i = 0; i < 5; i++) {
      t += 1000 / 60;
      tracker.recordFrame(t);
    }

    expect(tracker.min()!).toBeLessThan(25);
    expect(tracker.min()!).toBeGreaterThan(15);
  });

  it('reset() clears accumulated history', () => {
    const tracker = new FpsTracker();
    tracker.recordFrame(0);
    tracker.recordFrame(1000 / 60);
    expect(tracker.min()).not.toBeNull();

    tracker.reset();
    expect(tracker.min()).toBeNull();
  });
});
