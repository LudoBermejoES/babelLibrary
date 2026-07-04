import { describe, expect, it } from 'vitest';
import { InputModeMachine } from '../src/controls/input-mode';

describe('InputModeMachine', () => {
  it('starts in ENTER_OVERLAY', () => {
    const machine = new InputModeMachine();
    expect(machine.mode).toBe('ENTER_OVERLAY');
  });

  it('click while in ENTER_OVERLAY requests pointer lock (but does not transition until pointerlockchange fires)', () => {
    const machine = new InputModeMachine();
    machine.click();
    // Per doc 06: "the browser fires pointerlockchange asynchronously —
    // treat that event (not our request) as the source of truth."
    expect(machine.mode).toBe('ENTER_OVERLAY');
  });

  it('pointerLockAcquired from ENTER_OVERLAY transitions to WALKING', () => {
    const machine = new InputModeMachine();
    machine.click();
    machine.pointerLockAcquired();
    expect(machine.mode).toBe('WALKING');
  });

  it('Esc while WALKING releases pointer lock, and the resulting pointerlockchange transitions to PAUSE_OVERLAY', () => {
    // Doc 06: "the browser fires pointerlockchange asynchronously — treat
    // that event (not our request) as the source of truth." Esc itself
    // doesn't transition anything directly while WALKING; it triggers the
    // browser to release pointer lock, and pointerLockLost() is what the
    // caller wires to the resulting pointerlockchange event.
    const machine = new InputModeMachine();
    machine.click();
    machine.pointerLockAcquired();
    machine.pointerLockLost();
    expect(machine.mode).toBe('PAUSE_OVERLAY');
  });

  it('click from PAUSE_OVERLAY re-requests pointer lock, returning to WALKING once acquired', () => {
    const machine = new InputModeMachine();
    machine.click();
    machine.pointerLockAcquired();
    machine.pointerLockLost();
    expect(machine.mode).toBe('PAUSE_OVERLAY');

    machine.click();
    expect(machine.mode).toBe('PAUSE_OVERLAY'); // still async, per pointerlockchange rule
    machine.pointerLockAcquired();
    expect(machine.mode).toBe('WALKING');
  });

  it('openReader from WALKING transitions to READER and releases pointer lock intent', () => {
    const machine = new InputModeMachine();
    machine.click();
    machine.pointerLockAcquired();
    machine.openReader();
    expect(machine.mode).toBe('READER');
  });

  it('closeReader from READER returns to WALKING at the same pose (no pointer-lock re-request needed)', () => {
    const machine = new InputModeMachine();
    machine.click();
    machine.pointerLockAcquired();
    machine.openReader();
    machine.closeReader();
    expect(machine.mode).toBe('WALKING');
  });

  it('Esc while READER also returns to WALKING (per doc 06 diagram: Esc/close)', () => {
    const machine = new InputModeMachine();
    machine.click();
    machine.pointerLockAcquired();
    machine.openReader();
    machine.escapePressed();
    expect(machine.mode).toBe('WALKING');
  });

  it('notifies subscribers on every mode change', () => {
    const machine = new InputModeMachine();
    const seen: string[] = [];
    machine.onModeChange((mode) => seen.push(mode));

    machine.click();
    machine.pointerLockAcquired();
    machine.pointerLockLost();

    expect(seen).toEqual(['WALKING', 'PAUSE_OVERLAY']);
  });
});
