import type { BrowserWindow } from 'electron';

/**
 * Invisibilidad frente a la captura de pantalla.
 *
 * En Windows, `setContentProtection(true)` llama a `SetWindowDisplayAffinity`
 * con `WDA_EXCLUDEFROMCAPTURE`: el compositor (DWM) omite la ventana al
 * construir el buffer de captura, así que no aparece en screen shares,
 * grabadores ni OBS. Requiere Windows 10 2004+; en builds anteriores degrada
 * a `WDA_MONITOR` y la ventana sale como un rectángulo negro.
 *
 * LÍMITES REALES de este mecanismo (documentados también en el README):
 *   - No protege frente a una cámara apuntando a la pantalla física.
 *   - No oculta el proceso: software de proctoring que enumere procesos o
 *     ventanas lo verá.
 *   - No oculta el audio del micrófono.
 */

/** Ventanas con stealth aplicado, para poder re-aplicarlo y alternarlo en bloque. */
const tracked = new Set<BrowserWindow>();

/**
 * Electron pierde el flag de content protection al ocultar y volver a mostrar
 * la ventana (electron/electron#29085, corregido parcialmente en #45868 pero
 * aún inconsistente entre builds de Windows). Re-aplicarlo en cada `show` es
 * lo que evita que el overlay se vuelva visible tras un toggle — es la causa
 * número uno de fugas en este tipo de app, así que no quitar este hook.
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

/** Estado deseado por ventana; `setContentProtection` no tiene getter en Electron. */
const stealthState = new WeakMap<BrowserWindow, boolean>();

export function isStealthOn(win: BrowserWindow): boolean {
  return stealthState.get(win) ?? false;
}

export function applyStealth(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  registerWindow(win);
  stealthState.set(win, true);

  win.setContentProtection(true);
  // 'screen-saver' es el nivel más alto: se mantiene sobre ventanas fullscreen,
  // que es exactamente el caso de una videollamada maximizada.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setSkipTaskbar(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

/**
 * Vuelve la ventana detectable. Lo usa el switch del dashboard: sirve para
 * grabar demos, depurar la UI y comprobar que el toggle funciona en ambos
 * sentidos (si nunca lo apagas, no sabes si de verdad estaba encendido).
 *
 * Registra la ventana igual que `applyStealth`: aunque el stealth arranque
 * apagado, la ventana debe quedar en `tracked` para que `setStealthForAll`
 * pueda encenderlo más tarde desde el dashboard.
 */
export function removeStealth(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  registerWindow(win);
  stealthState.set(win, false);

  win.setContentProtection(false);
  win.setSkipTaskbar(false);
  // El overlay debe seguir por encima de la videollamada aunque sea detectable.
  win.setAlwaysOnTop(true, 'screen-saver');
}

export function setStealth(win: BrowserWindow, enabled: boolean): void {
  if (enabled) applyStealth(win);
  else removeStealth(win);
}

/** Aplica el estado a todas las ventanas registradas (las llama el store de settings). */
export function setStealthForAll(enabled: boolean): void {
  for (const win of tracked) {
    if (!win.isDestroyed()) setStealth(win, enabled);
  }
}

/**
 * Click-through: el overlay deja pasar los clics a la ventana de abajo.
 * `forward: true` mantiene los eventos de movimiento llegando al renderer,
 * lo que permite seguir mostrando estados hover mientras los clics atraviesan.
 */
export function setClickThrough(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return;
  win.setIgnoreMouseEvents(enabled, enabled ? { forward: true } : undefined);
}
