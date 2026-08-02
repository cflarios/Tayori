import { BrowserWindow } from 'electron';
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
    title: 'Audio Helper',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboard.once('ready-to-show', () => dashboard?.show());
  dashboard.on('closed', () => {
    dashboard = null;
  });

  loadRenderer(dashboard, 'dashboard');
  return dashboard;
}
