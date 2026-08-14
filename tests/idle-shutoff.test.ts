import { describe, expect, it } from 'vitest';
import { idleShutoffDue } from '../src/shared/types';

/**
 * The idle shutoff: if nobody talks for the configured minutes, the app stops
 * listening. The logic is pure so it can be pinned without the orchestrator.
 */
describe('idleShutoffDue', () => {
  const cfg = (enabled: boolean, minutes: number) => ({
    idleShutoffEnabled: enabled,
    idleShutoffMinutes: minutes,
  });

  it("doesn't turn off if disabled, no matter how much silence there is", () => {
    expect(idleShutoffDue(cfg(false, 10), 60 * 60_000)).toBe(false);
  });

  it('turns off on reaching the threshold', () => {
    expect(idleShutoffDue(cfg(true, 10), 10 * 60_000)).toBe(true);
    expect(idleShutoffDue(cfg(true, 10), 10 * 60_000 + 1)).toBe(true);
  });

  it("doesn't turn off before the threshold", () => {
    expect(idleShutoffDue(cfg(true, 10), 10 * 60_000 - 1)).toBe(false);
    expect(idleShutoffDue(cfg(true, 5), 4 * 60_000)).toBe(false);
  });

  it("a zero (from a hand-edited settings.json) doesn't turn off on the spot", () => {
    // Without this guard, minutes=0 would make any silence ≥ 0 turn off listening
    // right at the start.
    expect(idleShutoffDue(cfg(true, 0), 0)).toBe(false);
    expect(idleShutoffDue(cfg(true, 0), 60 * 60_000)).toBe(false);
  });
});
