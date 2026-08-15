import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, nativeImage } from 'electron';
import { is } from '@electron-toolkit/utils';
import type { DecoyIcon } from '@shared/types';

/**
 * Taskbar disguise: what icon file and window title each decoy uses.
 *
 * `off` is the real Tayori; the rest borrow a Windows tool's look. The overlay
 * is already invisible in captures, but its taskbar icon and title still say
 * what the app is to anyone glancing at the machine — this closes that gap.
 */
const DECOY: Record<DecoyIcon, { file: string; title: string }> = {
  off: { file: 'tayori.ico', title: 'Tayori' },
  terminal: { file: 'terminal.ico', title: 'Windows Terminal' },
  settings: { file: 'settings.ico', title: 'Settings' },
  taskmanager: { file: 'taskmanager.ico', title: 'Task Manager' },
};

/**
 * Where the runtime icons live: the project's `resources/icons` in dev, the
 * packaged app's `resources/icons` (copied there by electron-builder's
 * `extraResources`) once built.
 */
function iconsDir(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources', 'icons')
    : join(process.resourcesPath, 'icons');
}

/**
 * Masquerades a window's taskbar entry as a Windows tool: icon AND title.
 *
 * The title always follows the setting; the icon only when its file exists, so a
 * decoy the user hasn't dropped in yet degrades to a title change rather than
 * failing. See `resources/icons/README.md`.
 */
export function applyDecoyIcon(win: BrowserWindow, decoy: DecoyIcon): void {
  if (win.isDestroyed()) return;
  const { file, title } = DECOY[decoy];
  win.setTitle(title);
  const path = join(iconsDir(), file);
  if (!existsSync(path)) return;
  const image = nativeImage.createFromPath(path);
  if (!image.isEmpty()) win.setIcon(image);
}

/** Re-applies the decoy to every open window (the settings store calls this). */
export function applyDecoyToAll(decoy: DecoyIcon): void {
  for (const win of BrowserWindow.getAllWindows()) {
    applyDecoyIcon(win, decoy);
  }
}
