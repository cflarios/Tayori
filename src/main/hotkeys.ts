import { globalShortcut } from 'electron';
import { activeHotkeys, type HotkeyMap } from '@shared/types';
import { settingsStore } from './config/store';
import { getOverlay, nudgeOverlay, toggleOverlayVisibility } from './windows/overlay';
import { setClickThrough } from './windows/stealth';

/** Actions a hotkey can trigger. `registerHotkeys` fills them in. */
export interface HotkeyActions {
  askNow: () => void;
  screenshotAndAsk: () => void;
  solveOnScreen: () => void;
  solveQuiz: () => void;
  captureFrame: () => void;
  solveCapture: () => void;
  toggleListening: () => void;
  teleprompterNext: () => void;
  teleprompterPrev: () => void;
}

let bound: string[] = [];

/**
 * Registers the global shortcuts. Returns the accelerators Windows rejected
 * (usually because another app already holds them) so it can warn in the
 * dashboard instead of failing silently.
 */
export function registerHotkeys(actions: HotkeyActions): string[] {
  unregisterHotkeys();

  // The disabled ones arrive blank, and `bind` already ignores the empty: the
  // combination isn't registered, so it's free for whatever app wants it.
  const keys: HotkeyMap = activeHotkeys(settingsStore.get());
  const failed: string[] = [];

  const bind = (accelerator: string, handler: () => void): void => {
    if (!accelerator) return;
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (ok) bound.push(accelerator);
      else failed.push(accelerator);
    } catch {
      // An accelerator with invalid syntax throws instead of returning false.
      failed.push(accelerator);
    }
  };

  bind(keys.askNow, actions.askNow);
  bind(keys.screenshotAndAsk, actions.screenshotAndAsk);
  bind(keys.solveOnScreen, actions.solveOnScreen);
  bind(keys.solveQuiz, actions.solveQuiz);
  bind(keys.captureFrame, actions.captureFrame);
  bind(keys.solveCapture, actions.solveCapture);
  bind(keys.toggleListening, actions.toggleListening);
  // They only reach here with the teleprompter on: `activeHotkeys` leaves them
  // blank otherwise, and `bind` ignores the empty.
  bind(keys.teleprompterNext, actions.teleprompterNext);
  bind(keys.teleprompterPrev, actions.teleprompterPrev);
  bind(keys.toggleOverlay, toggleOverlayVisibility);
  // No shortcut for the dashboard: it opens only with the overlay's gear.

  bind(keys.toggleClickThrough, () => {
    const win = getOverlay();
    if (!win) return;
    const next = !settingsStore.get().clickThrough;
    settingsStore.update({ clickThrough: next });
    setClickThrough(win, next);
  });

  bind(keys.moveUp, () => nudgeOverlay(0, -1));
  bind(keys.moveDown, () => nudgeOverlay(0, 1));
  bind(keys.moveLeft, () => nudgeOverlay(-1, 0));
  bind(keys.moveRight, () => nudgeOverlay(1, 0));

  if (failed.length) {
    console.warn('[hotkeys] no se pudieron registrar (¿ya en uso?):', failed.join(', '));
  }
  return failed;
}

export function unregisterHotkeys(): void {
  for (const accelerator of bound) globalShortcut.unregister(accelerator);
  bound = [];
}
