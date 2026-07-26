import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';

export type RendererName = 'overlay' | 'dashboard' | 'audio-worker';

/**
 * Carga una de las tres entradas HTML.
 *
 * En dev, electron-vite expone el servidor de Vite en `ELECTRON_RENDERER_URL`
 * y cada entrada se sirve por su ruta relativa al `root` del renderer.
 * En producción, los HTML quedan en `out/renderer/<name>/index.html`.
 */
export function loadRenderer(win: BrowserWindow, name: RendererName): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`);
  } else {
    void win.loadFile(join(__dirname, `../renderer/${name}/index.html`));
  }
}

export const preloadPath = (): string => join(__dirname, '../preload/index.js');
