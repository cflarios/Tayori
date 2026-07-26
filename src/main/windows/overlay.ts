import { BrowserWindow, screen } from 'electron';
import { settingsStore } from '../config/store';
import { setClickThrough, setStealth } from './stealth';
import { loadRenderer, preloadPath } from './resolve';

let overlay: BrowserWindow | null = null;

const WIDTH = 460;
const HEIGHT = 560;
const MARGIN = 24;
/** Píxeles que se desplaza el overlay con los hotkeys de movimiento. */
const NUDGE = 40;

export function getOverlay(): BrowserWindow | null {
  return overlay && !overlay.isDestroyed() ? overlay : null;
}

export function createOverlay(): BrowserWindow {
  const existing = getOverlay();
  if (existing) return existing;

  const settings = settingsStore.get();
  const { workArea } = screen.getPrimaryDisplay();

  overlay = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    // Arranca arriba a la derecha: la zona con menos UI en Meet/Teams/Zoom.
    x: workArea.x + workArea.width - WIDTH - MARGIN,
    y: workArea.y + MARGIN,

    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,

    /**
     * `focusable: false` es deliberado y es la diferencia entre pasar
     * desapercibido o no: si el overlay roba el foco, la videollamada muestra
     * "dejaste de compartir" o el usuario pierde el cursor del campo activo.
     * Se activa temporalmente sólo cuando hay que escribir en el input.
     */
    focusable: false,
    show: false,

    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Evita que Chromium ralentice timers y animaciones cuando la ventana
      // no tiene foco — que en esta app es prácticamente siempre.
      backgroundThrottling: false,
    },
  });

  overlay.once('ready-to-show', () => {
    const win = overlay;
    if (!win) return;
    // Orden importante: aplicar stealth ANTES del primer show, o el overlay
    // aparece durante un frame en la captura.
    setStealth(win, settings.stealthEnabled);
    setClickThrough(win, settings.clickThrough);
    // showInactive, no show: mostrar sin robar el foco a la videollamada.
    win.showInactive();
  });

  overlay.on('closed', () => {
    overlay = null;
  });

  loadRenderer(overlay, 'overlay');
  return overlay;
}

export function toggleOverlayVisibility(): void {
  const win = getOverlay();
  if (!win) return;
  // El hook de `show` en stealth.ts re-aplica la protección de contenido.
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

/**
 * Permite escribir en el overlay sin romper la regla de no robar foco:
 * lo vuelve enfocable, enfoca, y al terminar revierte.
 */
export function setOverlayInteractive(interactive: boolean): void {
  const win = getOverlay();
  if (!win) return;

  win.setFocusable(interactive);
  if (interactive) {
    setClickThrough(win, false);
    win.focus();
  } else {
    setClickThrough(win, settingsStore.get().clickThrough);
  }
}

export function nudgeOverlay(dx: number, dy: number): void {
  const win = getOverlay();
  if (!win) return;
  // getPosition/getSize devuelven number[], no tuplas: indexamos con default.
  const pos = win.getPosition();
  win.setPosition((pos[0] ?? 0) + dx * NUDGE, (pos[1] ?? 0) + dy * NUDGE);
}

export function resizeOverlay(height: number): void {
  const win = getOverlay();
  if (!win) return;
  const width = win.getSize()[0] ?? WIDTH;
  win.setSize(width, Math.round(Math.max(120, Math.min(height, 900))));
}
