import { describe, expect, it } from 'vitest';
import {
  activeHotkeys,
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  type HotkeyMap,
  type Settings,
} from '../src/shared/types';
import { duplicateAccelerators } from '../src/shared/accelerator';

/**
 * Turning off a shortcut has to **release the combination**, not just stop doing
 * its job. A global accelerator takes it away from whatever application has the
 * focus, so a turned-off shortcut that stayed registered would be the worst of
 * both worlds: it does nothing and on top of that nobody else can use those keys.
 *
 * Everything checked here goes through `activeHotkeys`, which is the only place
 * where it's decided what's alive. It's consumed by the `globalShortcut`
 * registration and by the dashboard's duplicates warning.
 */

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe('activeHotkeys', () => {
  it('with nothing off it returns the shortcuts as-is', () => {
    // With the teleprompter on: its two shortcuts only exist with the mode
    // active, so that's the only state in which they're ALL alive.
    expect(activeHotkeys(settings({ teleprompterEnabled: true }))).toEqual(DEFAULT_HOTKEYS);
  });

  it("the teleprompter's aren't registered with the mode off", () => {
    /*
     * It's the same rule as the shortcut toggle, applied on its own: a global
     * accelerator takes the combination away from whatever application has the
     * focus, and taking two for a feature that's off is exactly what has to be
     * avoided. With the mode off, Ctrl+Shift+Down belongs to whoever wants it.
     */
    const active = activeHotkeys(settings({ teleprompterEnabled: false }));

    expect(active.teleprompterNext).toBe('');
    expect(active.teleprompterPrev).toBe('');
    // And it doesn't take out the others.
    expect(active.askNow).toBe(DEFAULT_HOTKEYS.askNow);
  });

  it("empties the accelerator of the off one and doesn't touch the others", () => {
    const active = activeHotkeys(settings({ disabledHotkeys: ['solveQuiz'] }));

    // Empty is what `registerHotkeys` already ignored: the combination never gets
    // registered, so it's free for another application.
    expect(active.solveQuiz).toBe('');
    expect(active.askNow).toBe(DEFAULT_HOTKEYS.askNow);
    expect(active.solveOnScreen).toBe(DEFAULT_HOTKEYS.solveOnScreen);
  });

  it("does NOT erase the saved accelerator: turning off isn't forgetting", () => {
    // It's what lets you turn it back on without typing the combination again;
    // if turning off emptied `settings.hotkeys`, the value would have been lost.
    const current = settings({ disabledHotkeys: ['moveUp'] });
    activeHotkeys(current);
    expect(current.hotkeys.moveUp).toBe(DEFAULT_HOTKEYS.moveUp);
  });

  it('a turned-off shortcut stops counting as a clash', () => {
    /*
     * The real case: you reassign something to a combination that another action
     * you have turned off already used. There's no conflict —only one is
     * registered— and marking it red would send you to fix a problem that
     * doesn't exist.
     */
    const collide: HotkeyMap = { ...DEFAULT_HOTKEYS, moveUp: DEFAULT_HOTKEYS.askNow };

    expect(duplicateAccelerators(collide).size).toBe(1);
    expect(
      duplicateAccelerators(
        activeHotkeys(settings({ hotkeys: collide, disabledHotkeys: ['moveUp'] }))
      ).size
    ).toBe(0);
  });

  it('with everything off no combination is left taken', () => {
    const all = Object.keys(DEFAULT_HOTKEYS) as (keyof HotkeyMap)[];
    const active = activeHotkeys(settings({ disabledHotkeys: all }));

    expect(Object.values(active).every((accelerator) => accelerator === '')).toBe(true);
  });

  it('tolerates a turned-off action that no longer exists', () => {
    // A `settings.json` from a version that had a shortcut removed afterward.
    const active = activeHotkeys(
      settings({
        teleprompterEnabled: true,
        disabledHotkeys: ['unaQueYaNoExiste' as keyof HotkeyMap],
      })
    );
    expect(active).toEqual(DEFAULT_HOTKEYS);
  });
});
