import { BrowserWindow, shell } from 'electron';
import { settingsStore } from '../config/store';
import { setStealthContentOnly } from './stealth';
import { loadRenderer, preloadPath } from './resolve';

let dashboard: BrowserWindow | null = null;

export function getDashboard(): BrowserWindow | null {
  return dashboard && !dashboard.isDestroyed() ? dashboard : null;
}

/**
 * Ventana de configuración. Redimensionable y enfocable (a diferencia del
 * overlay), pero NO aparece en la barra de tareas: reducir la presencia en la
 * interfaz de Windows es el objetivo, y el engranaje del overlay siempre la
 * recupera (`focus()`/`restore()` abajo), así que no hace falta el botón.
 *
 * El título es neutro: se filtra por Alt+Tab y por la sección "Aplicaciones"
 * del Administrador de tareas. La marca "Tayori" vive dentro del
 * contenido del dashboard, que sí ve el usuario y no se expone al sistema.
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
     * Sin marco del sistema: el dashboard pinta su propia barra de título al
     * estilo de macOS (los tres semáforos a la izquierda), y sus controles van
     * por IPC (`dashboardMinimize`/`ToggleMaximize`/`Close`). Sigue siendo
     * redimensionable desde los bordes —Electron conserva las asas de resize en
     * una ventana `frame: false` que no es `resizable: false`—, así que
     * `minWidth`/`minHeight` siguen valiendo. El `title` lleva la marca real
     * ("Tayori") en vez de un nombre neutro: una ventana sin marco sigue teniendo
     * título en Alt+Tab, y se decidió que ahí también vaya la marca.
     */
    frame: false,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Persistente como el overlay: se mantiene por encima aunque pulses otra
  // ventana, en vez de irse detrás. `screen-saver` es el nivel más alto —el mismo
  // que el overlay—, así que aguanta incluso sobre una videollamada maximizada.
  dashboard.setAlwaysOnTop(true, 'screen-saver');

  dashboard.once('ready-to-show', () => {
    const win = dashboard;
    if (!win) return;
    // Antes del primer `show`, o el dashboard aparecería un frame en la captura.
    // `content-only`: se excluye de la captura como el overlay, pero conserva la
    // barra de tareas y el foco de una ventana de ajustes. Sigue el interruptor de
    // sigilo, así que el modo demo lo vuelve visible igual que al overlay.
    setStealthContentOnly(win, settingsStore.get().stealthEnabled);
    win.show();
  });
  dashboard.on('closed', () => {
    dashboard = null;
  });

  /*
   * El dashboard es una SPA: navegar fuera de ella la rompe. Cualquier enlace a
   * un sitio externo se abre en el navegador del sistema y **nunca** dentro de la
   * ventana. Cubre las dos vías —clic normal (`will-navigate`) y target=_blank o
   * middle-click (`setWindowOpenHandler`)— y sólo deja pasar http(s), así que un
   * `file://` inesperado no abre nada.
   */
  const openExternally = (url: string): void => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  dashboard.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  dashboard.webContents.on('will-navigate', (event, url) => {
    // Sólo se intercepta lo que va a OTRO origen. Una navegación al mismo origen
    // es la propia app (incluido el recargado de HMR en `dev`, servido por
    // localhost), y bloquearla rompería el servidor de desarrollo.
    try {
      const current = dashboard?.webContents.getURL() ?? '';
      if (new URL(url).origin === new URL(current).origin) return;
    } catch {
      return; // URL o página actual sin origen parseable: no tocar.
    }
    event.preventDefault();
    openExternally(url);
  });

  loadRenderer(dashboard, 'dashboard');
  return dashboard;
}
