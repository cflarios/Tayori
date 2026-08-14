import { useEffect } from 'react';

/**
 * Makes the overlay's controls clickable even when clicks pass through.
 *
 * The problem: during a call the overlay is set with
 * `setIgnoreMouseEvents(true, { forward: true })` so clicks reach the window
 * below. That also makes the gear and the X unclickable.
 *
 * The solution `forward: true` enables is that the window keeps receiving the
 * MOVEMENT events even though it ignores clicks. So the renderer can know where
 * the cursor is and ask main to stop ignoring the mouse exactly while it's over
 * an element marked with `data-interactive`.
 *
 * The elements are marked with an attribute instead of checking coordinates
 * because that way the CSS can move the buttons without this logic noticing.
 */
export function useChromeMouse(): void {
  useEffect(() => {
    // Local state so as not to flood the IPC: only changes are reported.
    let ignoring = true;

    const apply = (next: boolean): void => {
      if (next === ignoring) return;
      ignoring = next;
      window.api.window.setMouseIgnore(next);
    };

    const onMouseMove = (event: MouseEvent): void => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const interactive = element?.closest('[data-interactive]') != null;
      apply(!interactive);
    };

    // On leaving the window, click-through has to be returned no matter what: if
    // the cursor exits fast over an edge, a last mousemove inside a
    // non-interactive area may not arrive, and the window would be left capturing
    // the mouse over the video call.
    const onMouseLeave = (): void => apply(true);

    /*
     * Re-syncs after the dashboard closes. The problem: while the dashboard has
     * focus, Windows stops forwarding `mousemove` to the overlay, and on closing
     * it main re-arms the `setIgnoreMouseEvents`. But this local cache
     * (`ignoring`) doesn't notice, so it may end up pointing to a state that no
     * longer matches main's; the `apply()` above would then early-return and the
     * hover wouldn't make the bar clickable again.
     *
     * The cure is to force a known state: `ignoring = true` is set without the
     * shortcut, and `setMouseIgnore(true)` is sent —which in main re-applies the
     * forwarding—, so the next `mousemove` evaluates from scratch again.
     */
    const onResync = (): void => {
      ignoring = true;
      window.api.window.setMouseIgnore(true);
    };

    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    const offResync = window.api.window.onResync(onResync);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      offResync();
      // Restore on unmount, or the overlay would be left capturing clicks.
      window.api.window.setMouseIgnore(true);
    };
  }, []);
}

/**
 * Window dragging with the left button.
 *
 * The movement is done by the main process following the cursor: here only the
 * start and the end are marked. A global `mouseup` (not on the element) because
 * dragging fast, the cursor leaves the bar before releasing.
 */
export function useOverlayDrag(): (event: React.MouseEvent) => void {
  useEffect(() => {
    const onMouseUp = (): void => window.api.window.endDrag();
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.api.window.endDrag();
    };
  }, []);

  return (event: React.MouseEvent) => {
    // Left button only, and not when pressing on a bar button.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    window.api.window.startDrag();
  };
}
