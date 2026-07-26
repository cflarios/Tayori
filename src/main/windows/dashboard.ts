import { BrowserWindow } from 'electron';
import { loadRenderer, preloadPath } from './resolve';

let dashboard: BrowserWindow | null = null;

export function getDashboard(): BrowserWindow | null {
  return dashboard && !dashboard.isDestroyed() ? dashboard : null;
}

/**
 * Ventana normal de configuración. Deliberadamente NO lleva stealth: es donde
 * el usuario administra la app y debe comportarse como una ventana corriente
 * (aparece en la barra de tareas, se puede redimensionar y enfocar).
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
    title: 'Interview Helper',
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
