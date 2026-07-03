/**
 * Rolling minimum-FPS tracker for the perf debug hook (doc 09 §5
 * `window.__babel.stats.fps30sMin`). Pure, no DOM/rAF dependency, so the
 * frame-to-FPS math is unit-testable independent of a real render loop.
 */
export class FpsTracker {
  private lastFrameTime: number | null = null;
  private minFps: number | null = null;

  /** Records a frame at `nowMs` (any monotonic millisecond clock — `performance.now()` in production). */
  recordFrame(nowMs: number): void {
    if (this.lastFrameTime !== null) {
      const deltaMs = nowMs - this.lastFrameTime;
      if (deltaMs > 0) {
        const fps = 1000 / deltaMs;
        this.minFps = this.minFps === null ? fps : Math.min(this.minFps, fps);
      }
    }
    this.lastFrameTime = nowMs;
  }

  /** Minimum instantaneous FPS seen since construction or the last `reset()`, or `null` if fewer than 2 frames have been recorded. */
  min(): number | null {
    return this.minFps;
  }

  reset(): void {
    this.lastFrameTime = null;
    this.minFps = null;
  }
}
