import { BrowserWindow } from 'electron';
import { loadRenderer, preloadPath } from './resolve';

let worker: BrowserWindow | null = null;

/**
 * Ventana oculta dedicada a la captura de audio.
 *
 * Existe como ventana separada por dos razones:
 *  1. `getUserMedia` y `getDisplayMedia` sólo están disponibles en un contexto
 *     de renderer, no en el proceso main.
 *  2. Aislarla del overlay evita que el pipeline de audio se detenga cuando el
 *     usuario oculta el overlay, y que compita con el render de la UI.
 *
 * Nunca se muestra, así que no necesita stealth: una ventana que no se pinta
 * no aparece en ninguna captura.
 */
export function getAudioWorker(): BrowserWindow | null {
  return worker && !worker.isDestroyed() ? worker : null;
}

export function createAudioWorker(): BrowserWindow {
  const existing = getAudioWorker();
  if (existing) return existing;

  worker = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Crítico: sin esto Chromium estrangula los timers de una ventana sin
      // foco y el audio llega a tirones o se corta.
      backgroundThrottling: false,
    },
  });

  worker.on('closed', () => {
    worker = null;
  });

  loadRenderer(worker, 'audio-worker');
  return worker;
}

export function destroyAudioWorker(): void {
  getAudioWorker()?.destroy();
  worker = null;
}
