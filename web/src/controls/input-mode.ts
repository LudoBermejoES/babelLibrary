/**
 * Single input-mode state machine (doc 06 "Input modes", shared with the
 * reader in doc 07). Pure — no DOM/pointer-lock API calls here; callers
 * (main.ts) wire real DOM events to these methods and call
 * `pointerLockAcquired()`/`pointerLockLost()` from the browser's async
 * `pointerlockchange` event, which is the source of truth for WALKING
 * transitions per doc 06 — never our own lock/unlock request.
 */
export type InputMode = 'ENTER_OVERLAY' | 'WALKING' | 'PAUSE_OVERLAY' | 'READER';

type ModeListener = (mode: InputMode) => void;

export class InputModeMachine {
  private currentMode: InputMode = 'ENTER_OVERLAY';
  private readonly listeners: ModeListener[] = [];

  get mode(): InputMode {
    return this.currentMode;
  }

  onModeChange(listener: ModeListener): void {
    this.listeners.push(listener);
  }

  /** User clicked the scene from ENTER_OVERLAY/PAUSE_OVERLAY — requests pointer lock. Does not itself transition to WALKING (see `pointerLockAcquired`). */
  click(): void {
    // No-op in the pure state machine: the actual `requestPointerLock()`
    // call is the caller's responsibility. Present as a method so the
    // machine's public API mirrors doc 06's diagram edges 1:1.
  }

  /** Call from the browser's `pointerlockchange` event when lock was acquired. */
  pointerLockAcquired(): void {
    if (this.currentMode === 'ENTER_OVERLAY' || this.currentMode === 'PAUSE_OVERLAY') {
      this.setMode('WALKING');
    }
  }

  /** Call from `pointerlockchange` when lock was lost (Esc, browser UI, alt-tab, etc.) — the actual trigger for leaving WALKING, since Esc's real effect is the browser releasing pointer lock, which fires this asynchronously. */
  pointerLockLost(): void {
    if (this.currentMode === 'WALKING') {
      this.setMode('PAUSE_OVERLAY');
    }
  }

  /** Esc key handling for modes that don't hold pointer lock (READER) — WALKING's Esc path goes through the browser's native pointer-lock release instead, surfacing here via `pointerLockLost`. */
  escapePressed(): void {
    if (this.currentMode === 'READER') {
      this.setMode('WALKING');
    }
  }

  openReader(): void {
    if (this.currentMode === 'WALKING') {
      this.setMode('READER');
    }
  }

  closeReader(): void {
    if (this.currentMode === 'READER') {
      this.setMode('WALKING');
    }
  }

  private setMode(mode: InputMode): void {
    this.currentMode = mode;
    for (const listener of this.listeners) listener(mode);
  }
}
