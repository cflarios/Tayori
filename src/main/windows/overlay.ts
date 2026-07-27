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
    // Gotcha de Electron: en ventanas transparent+frameless, `skipTaskbar` a
    // veces no "prende" hasta re-aplicarlo tras mostrar. Sólo con stealth ON;
    // en modo demo (removeStealth) la ventana se muestra a propósito.
    if (settings.stealthEnabled) win.setSkipTaskbar(true);
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
  if (win.isVisible()) {
    // Ocultarlo mientras está enfocable lo dejaría así al volver, y una ventana
    // enfocable que reaparece puede robar el foco de la videollamada.
    setOverlayInteractive(false);
    win.hide();
  } else win.showInactive();
}

/**
 * `true` mientras el overlay está en modo escritura.
 *
 * Vive en el módulo y no en los settings porque es estado efímero de la ventana,
 * no una preferencia: si la app se reinicia, el overlay debe volver a arrancar
 * no enfocable pase lo que pase.
 */
let overlayInteractive = false;

export function isOverlayInteractive(): boolean {
  return overlayInteractive;
}

/**
 * Permite escribir en el overlay sin romper la regla de no robar foco:
 * lo vuelve enfocable, enfoca, y al terminar revierte.
 *
 * Es la única situación en la que el overlay toma el foco, y es aceptable
 * porque la pide el usuario explícitamente al abrir la pestaña de escritura.
 * Revertir NO es opcional: una ventana que se queda enfocable acaba robando el
 * foco de Teams/Meet, que es justo lo que delata al asistente (ver CONTEXT §4).
 */
export function setOverlayInteractive(interactive: boolean): void {
  const win = getOverlay();
  if (!win) return;

  overlayInteractive = interactive;
  win.setFocusable(interactive);
  if (interactive) {
    setClickThrough(win, false);
    win.focus();
  } else {
    setClickThrough(win, settingsStore.get().clickThrough);
  }
}

/**
 * Deja pasar o captura el ratón puntualmente.
 *
 * Lo llama el renderer al entrar y salir de la barra del overlay: con los clics
 * atravesables activados —el modo recomendado durante una llamada— la ventana
 * ignora el ratón por completo, y sin esto el engranaje y la X serían
 * inclicables. `forward: true` mantiene los eventos de movimiento llegando al
 * renderer, que es lo que le permite detectar el hover en primer lugar.
 */
export function setOverlayMouseIgnore(ignore: boolean): void {
  const win = getOverlay();
  if (!win) return;
  /*
   * En modo escritura manda `setOverlayInteractive` y esto no pinta nada. Sin
   * esta guarda los dos mecanismos se pelean: basta mover el cursor sobre una
   * zona no interactiva del panel para que el hover devuelva los clics
   * atravesables a mitad de una frase, y el botón de enviar deje de responder.
   * La autoridad está aquí, en el main, y no en el orden de los efectos de
   * React, que es demasiado frágil para sostener una invariante.
   */
  if (overlayInteractive) return;
  // Si el usuario desactivó los clics atravesables, la ventana ya es
  // interactiva por completo y no hay nada que alternar.
  if (!settingsStore.get().clickThrough) return;
  setClickThrough(win, ignore);
}

/**
 * Arrastre manual de la ventana.
 *
 * No se usa `-webkit-app-region: drag` porque no funciona con
 * `focusable: false`, y renunciar a esa opción no es viable: robar el foco de
 * la videollamada es justo lo que delata al asistente. En su lugar se sigue el
 * cursor desde el proceso main y se reposiciona la ventana.
 */
let dragTimer: NodeJS.Timeout | null = null;

export function startOverlayDrag(): void {
  const win = getOverlay();
  if (!win || dragTimer) return;

  const cursor = screen.getCursorScreenPoint();
  const pos = win.getPosition();
  // Desfase entre el cursor y la esquina de la ventana: mantenerlo constante
  // es lo que hace que la ventana no salte al empezar a arrastrar.
  const offsetX = cursor.x - (pos[0] ?? 0);
  const offsetY = cursor.y - (pos[1] ?? 0);

  // ~60 fps. Un intervalo en lugar de seguir los mousemove del renderer porque
  // el cursor sale de la ventana en cuanto el arrastre va rápido.
  dragTimer = setInterval(() => {
    const current = getOverlay();
    if (!current) {
      stopOverlayDrag();
      return;
    }
    const point = screen.getCursorScreenPoint();
    current.setPosition(point.x - offsetX, point.y - offsetY);
  }, 16);
}

export function stopOverlayDrag(): void {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
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
