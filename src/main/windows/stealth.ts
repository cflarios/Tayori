import type { BrowserWindow } from 'electron';
import { settingsStore } from '../config/store';

/**
 * Invisibility to screen capture.
 *
 * On Windows, `setContentProtection(true)` calls `SetWindowDisplayAffinity` with
 * `WDA_EXCLUDEFROMCAPTURE`: the compositor (DWM) omits the window when building
 * the capture buffer, so it doesn't appear in screen shares, recorders or OBS.
 * It requires Windows 10 2004+; on earlier builds it degrades to `WDA_MONITOR`
 * and the window comes out as a black rectangle.
 *
 * REAL LIMITS of this mechanism (also documented in the README):
 *   - It doesn't protect against a camera pointed at the physical screen.
 *   - It doesn't hide the process: proctoring software that enumerates processes
 *     or windows will see it.
 *   - It doesn't hide the microphone audio.
 */

/** Windows with stealth applied, so it can be re-applied and toggled in bulk. */
const tracked = new Set<BrowserWindow>();

/**
 * Electron loses the content-protection flag when hiding and re-showing the
 * window (electron/electron#29085, partially fixed in #45868 but still
 * inconsistent across Windows builds). Re-applying it on every `show` is what
 * keeps the overlay from becoming visible after a toggle — it's the number-one
 * cause of leaks in this kind of app, so don't remove this hook.
 */
function registerWindow(win: BrowserWindow): void {
  if (tracked.has(win)) return;
  tracked.add(win);

  const reapply = () => {
    if (win.isDestroyed()) return;
    if (isStealthOn(win)) win.setContentProtection(true);
  };

  win.on('show', reapply);
  win.on('restore', reapply);
  win.on('focus', reapply);
  win.once('closed', () => tracked.delete(win));
}

/** Desired state per window; `setContentProtection` has no getter in Electron. */
const stealthState = new WeakMap<BrowserWindow, boolean>();

/**
 * Windows that should only be **excluded from capture**, without the rest of the
 * overlay treatment (screen-saver-level always-on-top, all workspaces). It's the
 * dashboard: it's seen and used like a normal window —you can alt-tab to it, it
 * doesn't float over the video call— but DWM omits it from the capture buffer
 * just like the overlay. It follows the same stealth switch (`setStealthForAll`).
 */
const contentOnly = new WeakSet<BrowserWindow>();

export function isStealthOn(win: BrowserWindow): boolean {
  return stealthState.get(win) ?? false;
}

/**
 * Excludes a window from capture WITHOUT the overlay behavior. For the
 * dashboard: same `WDA_EXCLUDEFROMCAPTURE` and same re-applies on
 * show/restore/focus, but it doesn't touch the position or the taskbar. Call
 * before the first `show`, or a frame appears in the capture.
 */
export function setStealthContentOnly(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return;
  registerWindow(win);
  contentOnly.add(win);
  stealthState.set(win, enabled);
  win.setContentProtection(enabled);
}

export function applyStealth(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  registerWindow(win);
  stealthState.set(win, true);

  win.setContentProtection(true);
  // 'screen-saver' is the highest level: it stays over fullscreen windows, which
  // is exactly the case of a maximized video call.
  win.setAlwaysOnTop(true, 'screen-saver');
  // With a decoy set, keep the disguised taskbar entry even while stealthy —
  // that's what the disguise is FOR (invisible in captures, but an innocent
  // "Windows Terminal" on the taskbar). Only a bare 'off' decoy hides the entry.
  win.setSkipTaskbar(settingsStore.get().decoyIcon === 'off');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

/**
 * Makes the window detectable. The dashboard switch uses it: it's for recording
 * demos, debugging the UI and checking the toggle works both ways (if you never
 * turn it off, you don't know whether it was really on).
 *
 * It registers the window just like `applyStealth`: even if stealth starts off,
 * the window must stay in `tracked` so `setStealthForAll` can turn it on later
 * from the dashboard.
 */
export function removeStealth(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  registerWindow(win);
  stealthState.set(win, false);

  win.setContentProtection(false);
  win.setSkipTaskbar(false);
  // The overlay must stay above the video call even if it's detectable.
  win.setAlwaysOnTop(true, 'screen-saver');
}

export function setStealth(win: BrowserWindow, enabled: boolean): void {
  // The dashboard only toggles capture protection; the rest of the overlay
  // treatment (always-on-top, workspaces) isn't its business. That way the
  // dashboard's stealth switch turns it off and on without making it a floating
  // window.
  if (contentOnly.has(win)) {
    setStealthContentOnly(win, enabled);
    return;
  }
  if (enabled) applyStealth(win);
  else removeStealth(win);
}

/** Applies the state to all registered windows (the settings store calls them). */
export function setStealthForAll(enabled: boolean): void {
  for (const win of tracked) {
    if (!win.isDestroyed()) setStealth(win, enabled);
  }
}

/**
 * Click-through: the overlay lets clicks pass through to the window below.
 * `forward: true` keeps the movement events reaching the renderer, which allows
 * still showing hover states while the clicks pass through.
 */
export function setClickThrough(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return;
  win.setIgnoreMouseEvents(enabled, enabled ? { forward: true } : undefined);
}
