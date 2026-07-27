import { app, BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { IPC } from '@shared/ipc';
import type { Settings } from '@shared/types';
import { settingsStore } from './config/store';
import { clearSecret, getPresence, setSecret } from './config/secrets';
import {
  createOverlay,
  getOverlay,
  resizeOverlay,
  setOverlayMouseIgnore,
  startOverlayDrag,
  stopOverlayDrag,
  toggleOverlayVisibility,
} from './windows/overlay';
import { openDashboard } from './windows/dashboard';
import { setClickThrough, setStealthForAll } from './windows/stealth';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { audioCapture } from './capture/audio';
import { captureScreen } from './capture/screenshot';
// Renombrado: `session` colisiona con el módulo `session` de Electron, y la
// colisión resolvía silenciosamente a Function.prototype.bind.
import { session as sessionOrchestrator } from './core/session';
import { createLLMProvider, listModelsFor } from './llm';
import { probeOllama } from './llm/ollama';
import { ensureWhisperReady, getWhisperStatus } from './stt/whisper-assets';

/**
 * Habilita la captura de audio del sistema (loopback).
 *
 * Sin este handler, `getDisplayMedia()` en el renderer falla en Electron.
 * `audio: 'loopback'` captura la salida de audio del sistema sin drivers de
 * terceros (soportado en Windows 10+ desde Electron 31; nativo desde la 39).
 */
function enableLoopbackAudio(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const screenSource = sources[0];
      if (!screenSource) {
        // callback sin video cancela la petición de forma limpia.
        callback({});
        return;
      }
      // Pedimos video porque getDisplayMedia lo exige, pero el worker
      // descarta el track de video de inmediato: sólo queremos el audio.
      callback({ video: screenSource, audio: 'loopback' });
    },
    // El overlay tiene content protection, así que no se filtra en la captura.
    { useSystemPicker: false }
  );
}

/**
 * Concede permiso de micrófono y captura sólo a nuestras propias ventanas.
 *
 * Electron no concede `media` por defecto y `getUserMedia` fallaría con
 * NotAllowedError. Comprobamos el origen en lugar de aceptar todo: en dev el
 * renderer se sirve desde el dev server de Vite y en producción desde file://,
 * y nada más debería poder pedir el micrófono.
 */
function registerPermissionHandlers(): void {
  const allowed = new Set(['media', 'display-capture', 'clipboard-read']);

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    const isOwnWindow = BrowserWindow.getAllWindows().some(
      (win) => !win.isDestroyed() && win.webContents === contents
    );
    callback(isOwnWindow && allowed.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((contents, permission) => {
    if (!contents) return false;
    const isOwnWindow = BrowserWindow.getAllWindows().some(
      (win) => !win.isDestroyed() && win.webContents === contents
    );
    return isOwnWindow && allowed.has(permission);
  });
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function registerIpcHandlers(): void {
  // ── Settings ──
  ipcMain.handle(IPC.settingsGet, () => settingsStore.get());

  ipcMain.handle(IPC.settingsUpdate, (_e, patch: Partial<Settings>) => {
    const previous = settingsStore.get();
    const next = settingsStore.update(patch);

    if (patch.stealthEnabled !== undefined && patch.stealthEnabled !== previous.stealthEnabled) {
      setStealthForAll(next.stealthEnabled);
    }
    if (patch.clickThrough !== undefined) {
      const overlay = getOverlay();
      if (overlay) setClickThrough(overlay, next.clickThrough);
    }
    if (patch.hotkeys) {
      registerHotkeys(hotkeyActions);
    }
    return next;
  });

  // ── Secretos (las keys nunca salen hacia el renderer) ──
  ipcMain.handle(IPC.secretsGetPresence, () => getPresence());
  ipcMain.handle(IPC.secretsSet, (_e, key: 'anthropic' | 'google', value: string) => {
    setSecret(key, value);
    return getPresence();
  });
  ipcMain.handle(IPC.secretsClear, (_e, key: 'anthropic' | 'google') => {
    clearSecret(key);
    return getPresence();
  });

  // ── Ventanas ──
  ipcMain.handle(IPC.stealthSet, (_e, enabled: boolean) => {
    settingsStore.update({ stealthEnabled: enabled });
    setStealthForAll(enabled);
    return enabled;
  });

  ipcMain.handle(IPC.clickThroughSet, (_e, enabled: boolean) => {
    settingsStore.update({ clickThrough: enabled });
    const overlay = getOverlay();
    if (overlay) setClickThrough(overlay, enabled);
    return enabled;
  });

  ipcMain.handle(IPC.overlayHide, () => toggleOverlayVisibility());
  ipcMain.handle(IPC.overlayResize, (_e, height: number) => resizeOverlay(height));
  ipcMain.handle(IPC.dashboardOpen, () => {
    openDashboard();
  });

  // Alto tráfico (un evento por mousemove), así que van por `on` y no `handle`.
  ipcMain.on(IPC.overlayMouseIgnore, (_e, ignore: boolean) => setOverlayMouseIgnore(ignore));
  ipcMain.on(IPC.overlayDragStart, () => startOverlayDrag());
  ipcMain.on(IPC.overlayDragEnd, () => stopOverlayDrag());

  // La X del overlay cierra la app entera: el overlay ES la aplicación. Para
  // ocultarla temporalmente está Ctrl+Shift+H.
  ipcMain.handle(IPC.overlayQuit, () => {
    audioCapture.stop();
    app.quit();
  });

  // ── Captura de audio ──
  ipcMain.handle(IPC.captureStart, () => audioCapture.start());
  ipcMain.handle(IPC.captureStop, () => audioCapture.stop());
  ipcMain.handle(IPC.captureGetStatus, () => audioCapture.getStatus());

  // ── Respuestas ──
  ipcMain.handle(IPC.askNow, () => sessionOrchestrator.ask('hotkey'));
  ipcMain.handle(IPC.askWithText, (_e, text: string) => sessionOrchestrator.askWithText(text));
  ipcMain.handle(IPC.askAbort, () => sessionOrchestrator.abortAnswer());

  // ── Screenshots ──
  ipcMain.handle(IPC.screenshotTake, async () => {
    const image = await captureScreen();
    if (image) {
      sessionOrchestrator.attachImage(image);
      broadcast(IPC.onScreenshot, image);
    }
    return image;
  });

  // ── Modelos ──
  ipcMain.handle(IPC.llmListModels, () => {
    const settings = settingsStore.get();
    return listModelsFor(settings.llmProviderId, settings);
  });

  ipcMain.handle(IPC.llmTestConnection, async () => {
    try {
      return await createLLMProvider(settingsStore.get()).testConnection();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Ollama ──
  ipcMain.handle(IPC.ollamaGetStatus, () => probeOllama(settingsStore.get().ollamaBaseUrl));

  // ── Whisper local ──
  ipcMain.handle(IPC.whisperGetStatus, () => getWhisperStatus(settingsStore.get().whisperModel));

  ipcMain.handle(IPC.whisperInstall, async () => {
    try {
      await ensureWhisperReady(settingsStore.get().whisperModel, (progress) => {
        broadcast(IPC.onWhisperProgress, progress);
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

const hotkeyActions = {
  askNow: () => {
    void sessionOrchestrator.ask('hotkey');
  },
  screenshotAndAsk: () => {
    void captureScreen().then((image) => {
      if (image) {
        sessionOrchestrator.attachImage(image);
        broadcast(IPC.onScreenshot, image);
      }
      // Se pregunta siempre, con o sin captura: si falló la captura es mejor
      // responder sin ella que no responder nada.
      return sessionOrchestrator.ask('hotkey');
    });
  },
  toggleListening: () => {
    void audioCapture.toggle();
  },
};

// Fija app.name ANTES de cualquier getPath('userData'). El build empaquetado se
// renombra a un nombre neutro en electron-builder.yml (para que el Administrador
// de tareas no muestre "Interview Helper"), pero `app.name` deriva de aquí, no
// del productName del empaquetado. Sin este anclaje, un cambio de productName
// podría mover userData y orfanar los settings y la API key cifrada con DPAPI.
app.setName('interview-helper');

// Una sola instancia: dos procesos peleando por los mismos hotkeys globales
// y el mismo archivo de settings es una fuente de bugs difíciles de ver.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Intentar abrir una segunda instancia recupera el overlay en lugar de
  // arrancar otra app; es la vía de escape si se ocultó y no se recuerda el
  // atajo.
  app.on('second-instance', () => {
    const overlay = getOverlay();
    if (overlay && !overlay.isVisible()) overlay.showInactive();
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.interviewhelper.app');

    app.on('browser-window-created', (_, win) => {
      optimizer.watchWindowShortcuts(win);
    });

    enableLoopbackAudio();
    registerPermissionHandlers();
    audioCapture.registerHandlers();
    // Debe ir tras registerHandlers: el orquestador se suscribe a los eventos
    // que emite el controlador de captura.
    sessionOrchestrator.bind();
    registerIpcHandlers();

    settingsStore.on('change', (settings: Settings) => {
      broadcast(IPC.onSettings, settings);
    });

    createOverlay();
    registerHotkeys(hotkeyActions);

    // El dashboard NO se abre solo, ni siquiera en el primer arranque: solo con
    // el engranaje del overlay. Cuando faltan las keys, el overlay muestra una
    // llamada a la acción que apunta a ese botón.
  });

  // En Windows el overlay es la app: si se cierra, no queda nada que hacer.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    unregisterHotkeys();
  });
}
