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

  /*
   * El dashboard NO es `always-on-top` a propósito, aunque se intentó.
   *
   * Se probó hacerlo persistente (que no se fuera detrás al pulsar otra app),
   * pero eso lo dejaba a nivel `screen-saver` peleándose con el overlay —la otra
   * ventana topmost— por el foco. Cada cambio de foco entre las dos rompe el
   * reenvío de `mousemove` del overlay (del que depende para detectar el hover y
   * volverse clicable), y el bloqueo se acumulaba cuanto más se usaba el
   * dashboard, peor en el `.exe`. Con una sola ventana topmost —el overlay— no
   * hay pelea y el overlay es estable. El coste es que el dashboard se va detrás
   * como cualquier ventana normal; se recupera con el engranaje del overlay.
   */

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
    /*
     * Red de seguridad: re-sincroniza el ratón del overlay al cerrar el dashboard.
     *
     * Con el dashboard ya sin `always-on-top` el bloqueo no debería darse —el
     * overlay es la única ventana topmost y no pierde su reenvío—, pero abrir y
     * cerrar una ventana enfocable puede dejar un hipo puntual en el reenvío de
     * `mousemove`. Esto lo cura: el renderer resetea su caché de ignore (que pudo
     * quedar desincronizado) y re-manda el estado, lo que en el main re-aplica
     * `setIgnoreMouseEvents(..., { forward: true })`, y se reasegura el topmost del
     * overlay. Con un `setTimeout` porque al dispararse `closed` Windows aún no ha
     * reasignado el foreground.
     */
    setTimeout(() => {
      const overlay = getOverlay();
      if (!overlay || isOverlayInteractive()) return;
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.webContents.send(IPC.onOverlayResync);
    }, 60);
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
