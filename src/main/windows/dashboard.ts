import { BrowserWindow, shell } from 'electron';
import { IPC } from '@shared/ipc';
import { settingsStore } from '../config/store';
import { setStealthContentOnly } from './stealth';
import { getOverlay, isOverlayInteractive } from './overlay';
import { loadRenderer, preloadPath } from './resolve';

let dashboard: BrowserWindow | null = null;

export function getDashboard(): BrowserWindow | null {
  return dashboard && !dashboard.isDestroyed() ? dashboard : null;
}

/**
 * Settings window. Resizable and focusable (unlike the overlay), but it does
 * NOT appear in the taskbar: reducing the presence in the Windows interface is
 * the goal, and the overlay's gear always recovers it (`focus()`/`restore()`
 * below), so the button isn't needed.
 *
 * The title is neutral: it leaks through Alt+Tab and the "Apps" section of Task
 * Manager. The "Tayori" brand lives inside the dashboard content, which the user
 * does see and which isn't exposed to the system.
 */
export function openDashboard(): BrowserWindow {
  const existing = getDashboard();
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  dashboard = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    skipTaskbar: true,
    title: 'Tayori',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    /*
     * No system frame: the dashboard paints its own title bar macOS-style (the
     * three traffic lights on the left), and its controls go over IPC
     * (`dashboardMinimize`/`ToggleMaximize`/`Close`). It's still resizable from
     * the edges —Electron keeps the resize handles on a `frame: false` window
     * that isn't `resizable: false`—, so `minWidth`/`minHeight` still hold. The
     * `title` carries the real brand ("Tayori") instead of a neutral name: a
     * frameless window still has a title in Alt+Tab, and it was decided the brand
     * goes there too.
     */
    frame: false,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  /*
   * The dashboard is NOT `always-on-top` on purpose, even though it was tried.
   *
   * Making it persistent (so it wouldn't go behind when clicking another app)
   * was tried, but that left it at `screen-saver` level fighting the overlay
   * —the other topmost window— for focus. Each focus change between the two
   * breaks the overlay's `mousemove` forwarding (which it depends on to detect
   * hover and become clickable), and the lock-up accumulated the more the
   * dashboard was used, worse in the `.exe`. With a single topmost window —the
   * overlay— there's no fight and the overlay is stable. The cost is that the
   * dashboard goes behind like any normal window; it's recovered with the
   * overlay's gear.
   */

  dashboard.once('ready-to-show', () => {
    const win = dashboard;
    if (!win) return;
    // Before the first `show`, or the dashboard would appear for a frame in the
    // capture. `content-only`: it's excluded from capture like the overlay, but
    // keeps the taskbar and focus of a settings window. It follows the stealth
    // switch, so demo mode makes it visible just like the overlay.
    setStealthContentOnly(win, settingsStore.get().stealthEnabled);
    win.show();
  });
  dashboard.on('closed', () => {
    dashboard = null;
    /*
     * Safety net: re-syncs the overlay's mouse when the dashboard closes.
     *
     * With the dashboard no longer `always-on-top` the lock-up shouldn't happen
     * —the overlay is the only topmost window and doesn't lose its forwarding—,
     * but opening and closing a focusable window can leave a one-off hiccup in
     * the `mousemove` forwarding. This cures it: the renderer resets its ignore
     * cache (which may have gone out of sync) and re-sends the state, which in
     * main re-applies `setIgnoreMouseEvents(..., { forward: true })`, and the
     * overlay's topmost is re-secured. With a `setTimeout` because when `closed`
     * fires Windows hasn't reassigned the foreground yet.
     */
    setTimeout(() => {
      const overlay = getOverlay();
      if (!overlay || isOverlayInteractive()) return;
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.webContents.send(IPC.onOverlayResync);
    }, 60);
  });

  /*
   * The dashboard is an SPA: navigating out of it breaks it. Any link to an
   * external site opens in the system browser and **never** inside the window. It
   * covers both paths —normal click (`will-navigate`) and target=_blank or
   * middle-click (`setWindowOpenHandler`)— and only lets http(s) through, so an
   * unexpected `file://` opens nothing.
   */
  const openExternally = (url: string): void => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  dashboard.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  dashboard.webContents.on('will-navigate', (event, url) => {
    // Only what goes to ANOTHER origin is intercepted. A same-origin navigation
    // is the app itself (including the HMR reload in `dev`, served by localhost),
    // and blocking it would break the dev server.
    try {
      const current = dashboard?.webContents.getURL() ?? '';
      if (new URL(url).origin === new URL(current).origin) return;
    } catch {
      return; // URL or current page with no parseable origin: don't touch.
    }
    event.preventDefault();
    openExternally(url);
  });

  loadRenderer(dashboard, 'dashboard');
  return dashboard;
}
