import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';

export type RendererName = 'overlay' | 'dashboard' | 'audio-worker';

/**
 * Loads one of the three HTML entries.
 *
 * In dev, electron-vite exposes the Vite server at `ELECTRON_RENDERER_URL` and
 * each entry is served by its path relative to the renderer's `root`. In
 * production, the HTML files land at `out/renderer/<name>/index.html`.
 */
export function loadRenderer(win: BrowserWindow, name: RendererName): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`);
  } else {
    void win.loadFile(join(__dirname, `../renderer/${name}/index.html`));
  }
}

export const preloadPath = (): string => join(__dirname, '../preload/index.js');
