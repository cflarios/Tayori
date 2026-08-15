import { BrowserWindow, screen } from 'electron';
import { OVERLAY_SIZES, type OverlaySize } from '@shared/types';
import { settingsStore } from '../config/store';
import { setClickThrough, setStealth } from './stealth';
import { loadRenderer, preloadPath } from './resolve';

let overlay: BrowserWindow | null = null;
/** Interval that keeps re-asserting the overlay's topmost level (see below). */
let topmostTimer: NodeJS.Timeout | null = null;

const MARGIN = 24;
/** Pixels the overlay moves with the movement hotkeys. */
const NUDGE = 40;

export function getOverlay(): BrowserWindow | null {
  return overlay && !overlay.isDestroyed() ? overlay : null;
}

export function createOverlay(): BrowserWindow {
  const existing = getOverlay();
  if (existing) return existing;

  const settings = settingsStore.get();
  const { workArea } = screen.getPrimaryDisplay();
  const { width, height } = OVERLAY_SIZES[settings.overlaySize];

  overlay = new BrowserWindow({
    width,
    height,
    // Starts top-right: the area with the least UI in Meet/Teams/Zoom.
    x: workArea.x + workArea.width - width - MARGIN,
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
     * `focusable: false` is deliberate and is the difference between going
     * unnoticed or not: if the overlay steals focus, the video call shows "you
     * stopped sharing" or the user loses the active field's cursor. It's enabled
     * temporarily only when you have to type in the input.
     */
    focusable: false,
    show: false,

    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Keeps Chromium from slowing timers and animations when the window is
      // unfocused — which in this app is practically always.
      backgroundThrottling: false,
    },
  });

  overlay.once('ready-to-show', () => {
    const win = overlay;
    if (!win) return;
    // Order matters: apply stealth BEFORE the first show, or the overlay appears
    // for a frame in the capture.
    setStealth(win, settings.stealthEnabled);
    setClickThrough(win, settings.clickThrough);
    // showInactive, not show: show without stealing focus from the video call.
    win.showInactive();
    // Electron gotcha: on transparent+frameless windows, `skipTaskbar`
    // sometimes doesn't "catch" until re-applied after showing. Only with stealth
    // ON; in demo mode (removeStealth) the window is shown on purpose.
    if (settings.stealthEnabled) win.setSkipTaskbar(true);
  });

  overlay.on('closed', () => {
    overlay = null;
    if (topmostTimer) {
      clearInterval(topmostTimer);
      topmostTimer = null;
    }
  });

  // Re-assert the topmost level whenever the window is shown and, alongside, on a
  // slow interval: Windows drops it on its own over time and it was otherwise set
  // only once at startup. See reassertOverlayTopmost.
  overlay.on('show', () => reassertOverlayTopmost());
  topmostTimer = setInterval(reassertOverlayTopmost, 1000);

  loadRenderer(overlay, 'overlay');
  return overlay;
}

export function toggleOverlayVisibility(): void {
  const win = getOverlay();
  if (!win) return;
  // The `show` hook in stealth.ts re-applies the content protection.
  if (win.isVisible()) {
    // Hiding it while it's focusable would leave it that way on return, and a
    // focusable window that reappears can steal the video call's focus.
    setOverlayInteractive(false);
    win.hide();
  } else win.showInactive();
}

/**
 * `true` while the overlay is in writing mode.
 *
 * It lives in the module and not in the settings because it's ephemeral window
 * state, not a preference: if the app restarts, the overlay must start up
 * non-focusable no matter what.
 */
let overlayInteractive = false;

export function isOverlayInteractive(): boolean {
  return overlayInteractive;
}

/**
 * Allows typing in the overlay without breaking the no-focus-stealing rule: it
 * makes it focusable, focuses, and reverts when done.
 *
 * It's the only situation in which the overlay takes focus, and it's acceptable
 * because the user asks for it explicitly by opening the writing tab. Reverting
 * is NOT optional: a window that stays focusable ends up stealing Teams/Meet's
 * focus, which is exactly what gives the assistant away (see CONTEXT §4).
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
 * Re-asserts the overlay's topmost level.
 *
 * `setAlwaysOnTop(true, 'screen-saver')` is applied once at startup, but Windows
 * drops HWND_TOPMOST on its own over time —another app claiming topmost, a
 * foreground change, a UAC prompt— and nothing was re-asserting it. Left alone,
 * the overlay slips behind other windows after a while and, being
 * `focusable: false` + `skipTaskbar`, becomes unreachable: its buttons only work
 * while the cursor is over it (useChromeMouse), which can't happen once it's
 * behind another window, so the only way out was killing the process. The `show`
 * hook and a slow interval keep it on top. Skipped in writing mode, where the
 * window is deliberately focusable and already on top by focus.
 */
function reassertOverlayTopmost(): void {
  const win = getOverlay();
  if (!win || overlayInteractive || !win.isVisible()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
}

/**
 * Brings the overlay back to the front. The escape hatch when it slipped behind
 * another window or was hidden: opening the app again calls this from the
 * `second-instance` handler. Re-shows it if hidden, then re-asserts topmost and
 * raises it —`moveTop()` doesn't steal focus, so the no-focus-stealing rule
 * holds—. Does nothing in writing mode, where it's focused and already on top.
 */
export function recoverOverlay(): void {
  const win = getOverlay();
  if (!win || overlayInteractive) return;
  if (!win.isVisible()) win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

/**
 * Lets the mouse pass through or captures it momentarily.
 *
 * The renderer calls it on entering and leaving the overlay bar: with
 * click-through enabled —the recommended mode during a call— the window ignores
 * the mouse entirely, and without this the gear and the X would be unclickable.
 * `forward: true` keeps the movement events reaching the renderer, which is what
 * lets it detect the hover in the first place.
 */
export function setOverlayMouseIgnore(ignore: boolean): void {
  const win = getOverlay();
  if (!win) return;
  /*
   * In writing mode `setOverlayInteractive` rules and this does nothing. Without
   * this guard the two mechanisms fight: just moving the cursor over a
   * non-interactive area of the panel makes the hover turn click-through back on
   * mid-sentence, and the send button stops responding. The authority is here, in
   * main, and not in the order of React's effects, which is too fragile to hold an
   * invariant.
   */
  if (overlayInteractive) return;
  // If the user disabled click-through, the window is already fully interactive
  // and there's nothing to toggle.
  if (!settingsStore.get().clickThrough) return;
  setClickThrough(win, ignore);
}

/**
 * Manual window dragging.
 *
 * `-webkit-app-region: drag` isn't used because it doesn't work with
 * `focusable: false`, and giving up that option isn't viable: stealing the video
 * call's focus is exactly what gives the assistant away. Instead the cursor is
 * followed from the main process and the window is repositioned.
 */
let dragTimer: NodeJS.Timeout | null = null;

export function startOverlayDrag(): void {
  const win = getOverlay();
  if (!win || dragTimer) return;

  const cursor = screen.getCursorScreenPoint();
  const pos = win.getPosition();
  // Offset between the cursor and the window's corner: keeping it constant is
  // what keeps the window from jumping when the drag starts.
  const offsetX = cursor.x - (pos[0] ?? 0);
  const offsetY = cursor.y - (pos[1] ?? 0);

  // ~60 fps. An interval instead of following the renderer's mousemove because
  // the cursor leaves the window as soon as the drag goes fast.
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
  // getPosition/getSize return number[], not tuples: we index with a default.
  const pos = win.getPosition();
  win.setPosition((pos[0] ?? 0) + dx * NUDGE, (pos[1] ?? 0) + dy * NUDGE);
}

/**
 * Applies one of the predefined sizes.
 *
 * It re-anchors to the right edge instead of growing to the right: the overlay
 * starts top-right (the area with the least UI in Meet/Teams/Zoom) and widening
 * it outward would push it off the screen.
 */
export function setOverlaySize(size: OverlaySize): void {
  const win = getOverlay();
  if (!win) return;

  const { width, height } = OVERLAY_SIZES[size];
  const pos = win.getPosition();
  const current = win.getSize();
  const right = (pos[0] ?? 0) + (current[0] ?? width);

  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.max(workArea.x, Math.min(right - width, workArea.x + workArea.width - width));
  const y = Math.min(pos[1] ?? 0, workArea.y + workArea.height - height);

  win.setBounds({ x, y: Math.max(workArea.y, y), width, height });
}

export function resizeOverlay(height: number): void {
  const win = getOverlay();
  if (!win) return;
  const clamped = Math.round(Math.max(120, Math.min(height, 900)));
  const bounds = win.getBounds();
  if (bounds.height === clamped) return;
  /*
   * `setBounds`, NOT `setSize`.
   *
   * The overlay is `resizable: false`, and on Windows a non-resizable window
   * ignores `setSize` —it was measured: the renderer asked for 58 px and the
   * window stayed at its preset height, leaving a tall empty area below the
   * compact bar (invisible while stealth is on, framed red when it's off).
   * `setBounds` is the same call the size presets use, and it does resize such a
   * window. Width and position are kept so only the height follows the content.
   */
  win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: clamped });
}
