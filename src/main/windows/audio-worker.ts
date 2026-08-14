import { BrowserWindow } from 'electron';
import { loadRenderer, preloadPath } from './resolve';

let worker: BrowserWindow | null = null;

/**
 * Hidden window dedicated to audio capture.
 *
 * It exists as a separate window for two reasons:
 *  1. `getUserMedia` and `getDisplayMedia` are only available in a renderer
 *     context, not in the main process.
 *  2. Isolating it from the overlay keeps the audio pipeline from stopping when
 *     the user hides the overlay, and from competing with the UI render.
 *
 * It's never shown, so it needs no stealth: a window that isn't painted appears
 * in no capture.
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
      // Critical: without this Chromium throttles the timers of an unfocused
      // window and the audio arrives stuttering or cuts out.
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
