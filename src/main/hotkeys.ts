import { globalShortcut } from 'electron';
import type { HotkeyMap } from '@shared/types';
import { settingsStore } from './config/store';
import { getOverlay, nudgeOverlay, toggleOverlayVisibility } from './windows/overlay';
import { setClickThrough } from './windows/stealth';

/** Acciones que un hotkey puede disparar. Las rellena `registerHotkeys`. */
export interface HotkeyActions {
  askNow: () => void;
  screenshotAndAsk: () => void;
  toggleListening: () => void;
}

let bound: string[] = [];

/**
 * Registra los atajos globales. Devuelve los acelerradores que Windows rechazó
 * (normalmente porque otra app ya los tiene tomados) para poder avisar en el
 * dashboard en lugar de fallar en silencio.
 */
export function registerHotkeys(actions: HotkeyActions): string[] {
  unregisterHotkeys();

  const keys: HotkeyMap = settingsStore.get().hotkeys;
  const failed: string[] = [];

  const bind = (accelerator: string, handler: () => void): void => {
    if (!accelerator) return;
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (ok) bound.push(accelerator);
      else failed.push(accelerator);
    } catch {
      // Un acelerador con sintaxis inválida lanza en lugar de devolver false.
      failed.push(accelerator);
    }
  };

  bind(keys.askNow, actions.askNow);
  bind(keys.screenshotAndAsk, actions.screenshotAndAsk);
  bind(keys.toggleListening, actions.toggleListening);
  bind(keys.toggleOverlay, toggleOverlayVisibility);
  // Sin atajo para el dashboard: se abre solo con el engranaje del overlay.

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
