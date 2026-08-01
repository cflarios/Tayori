import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  session,
  shell,
} from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { IPC } from '@shared/ipc';
import { alignAutoTrigger } from '@shared/types';
import { renderModelGuide } from '@shared/model-guide';
import type { LLMProviderId, PhoneMirrorStatus, ScreenTask, Settings } from '@shared/types';
import { settingsStore } from './config/store';
import { clearSecret, getPresence, setSecret } from './config/secrets';
import {
  clearHistory,
  deleteConversation,
  getConversation,
  historyLocation,
  listConversations,
} from './config/history';
import {
  createOverlay,
  getOverlay,
  resizeOverlay,
  setOverlayInteractive,
  setOverlayMouseIgnore,
  setOverlaySize,
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
import { testSTTConnection } from './stt';
import { whisperServer } from './stt/whisper-server';
import { initLogging, logLocation, readLogTail } from './logging';
import { getSystemSpecs } from './system-specs';
import { phoneBridge } from './bridge/phone';

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
  // El espejo del teléfono se engancha aquí y no a cada emisor: lo que ve el
  // overlay es exactamente lo que puede ver el móvil, sin una lista aparte que
  // se quede desfasada. Filtra él lo que le sirve.
  phoneBridge.publish(channel, payload);
}

function registerIpcHandlers(): void {
  // ── Settings ──
  ipcMain.handle(IPC.settingsGet, () => settingsStore.get());

  ipcMain.handle(IPC.settingsUpdate, (_e, rawPatch: Partial<Settings>) => {
    const previous = settingsStore.get();
    // Cambiar de fuente no puede dejar el disparo automático mudo; ver
    // `alignAutoTrigger`. Se hace aquí y no en la UI para que valga igual desde
    // el overlay y desde el dashboard.
    const patch = alignAutoTrigger(previous, rawPatch);
    const next = settingsStore.update(patch);

    if (patch.autoTriggerSpeaker && patch.autoTriggerSpeaker !== previous.autoTriggerSpeaker) {
      const quien = patch.autoTriggerSpeaker === 'them' ? 'el interlocutor' : 'ti';
      console.log(
        `[auto] el disparo pasa a "${patch.autoTriggerSpeaker}" para seguir a ` +
          `audioSources="${next.audioSources}"`
      );
      // Se dice: es un ajuste que el usuario no pidió, aunque sea el que hace
      // que lo que sí pidió funcione.
      broadcast(IPC.onNotice, `Ahora respondo a lo que diga ${quien}.`);
    }

    if (patch.stealthEnabled !== undefined && patch.stealthEnabled !== previous.stealthEnabled) {
      setStealthForAll(next.stealthEnabled);
    }
    if (patch.clickThrough !== undefined) {
      const overlay = getOverlay();
      if (overlay) setClickThrough(overlay, next.clickThrough);
    }
    if (patch.hotkeys) {
      applyHotkeys();
    }
    if (patch.overlaySize && patch.overlaySize !== previous.overlaySize) {
      setOverlaySize(next.overlaySize);
    }
    /*
     * Cambiar qué se escucha exige reabrir los streams.
     *
     * `audioSources` sólo se lee dentro de `capture.start()`, y los hablantes
     * del motor de STT se fijan al arrancar la transcripción. Sin esto, cambiar
     * la fuente en mitad de una sesión no hacía absolutamente nada: la UI se
     * actualizaba, el ajuste se guardaba, y se seguía escuchando lo de antes
     * hasta que alguien parase y volviese a arrancar a mano.
     */
    if (
      patch.audioSources &&
      patch.audioSources !== previous.audioSources &&
      audioCapture.getStatus().state === 'listening'
    ) {
      audioCapture.stop();
      void audioCapture.start();
    }
    // Apagar el historial a mitad de una conversación debe cortar también la que
    // está en curso; si no, seguiría en memoria y volvería a disco al reactivarlo.
    if (patch.historyEnabled === false && previous.historyEnabled) {
      sessionOrchestrator.newConversation();
    }
    // El espejo se aplica desde aquí, no desde la UI, para que el estado del
    // servidor no dependa de qué ventana tocó el interruptor.
    if (
      patch.phoneMirrorEnabled !== undefined ||
      patch.phoneMirrorLan !== undefined
    ) {
      phoneBridge.apply(next);
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

  // Modo escritura: la única vía por la que el overlay toma el foco, y siempre
  // a petición explícita del usuario (abrir la pestaña de escritura).
  ipcMain.handle(IPC.overlayInteractive, (_e, interactive: boolean) =>
    setOverlayInteractive(interactive)
  );
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
    // Volcar antes de salir: lo que quedara en el debounce se perdería.
    sessionOrchestrator.flush();
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
  ipcMain.handle(IPC.askSolveScreen, (_e, task: ScreenTask = 'code') =>
    sessionOrchestrator.solveOnScreen(task)
  );
  ipcMain.handle(IPC.askForgetContext, () => sessionOrchestrator.forgetContext());
  ipcMain.handle(IPC.memoryGet, () => sessionOrchestrator.answers.memory);

  // ── Screenshots ──
  ipcMain.handle(IPC.screenshotTake, async () => {
    const image = await captureScreen();
    if (image) {
      sessionOrchestrator.attachImage(image);
      broadcast(IPC.onScreenshot, image);
    }
    return image;
  });

  // ── Portapapeles ──
  // Vive en el main porque en el overlay no hay alternativa: ver `IPC.clipboardWrite`.
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string) => {
    clipboard.writeText(text);
  });

  // ── Historial de conversaciones ──
  ipcMain.handle(IPC.conversationNew, () => {
    sessionOrchestrator.newConversation();
  });
  ipcMain.handle(IPC.historyList, () => listConversations());
  ipcMain.handle(IPC.historyGet, (_e, id: string) => getConversation(id));
  ipcMain.handle(IPC.historyDelete, (_e, id: string) => {
    deleteConversation(id);
    return listConversations();
  });
  ipcMain.handle(IPC.historyClear, () => {
    // Se corta la conversación en curso antes de borrar: si no, el debounce
    // pendiente volvería a escribir en disco justo después de vaciar la carpeta.
    sessionOrchestrator.newConversation();
    clearHistory();
    return listConversations();
  });
  ipcMain.handle(IPC.historyLocation, () => historyLocation());

  // ── Modelos ──
  // Con `providerId` se puede poblar el selector de un proveedor que NO es el
  // activo, que es lo que necesita el modelo aparte para la pantalla.
  ipcMain.handle(IPC.llmListModels, (_e, providerId?: LLMProviderId) => {
    const settings = settingsStore.get();
    return listModelsFor(providerId ?? settings.llmProviderId, settings);
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

  // ── Máquina ──
  ipcMain.handle(IPC.systemGetSpecs, () => getSystemSpecs());

  /*
   * La guía de modelos, como documento.
   *
   * Se escribe en `userData` y se abre con el navegador del sistema. Dos motivos
   * para no montar una ventana propia: cada ventana de Electron hay que
   * registrarla en la protección de captura —y el modo invisible se verifica, no
   * se asume—, y un HTML en disco se guarda, se imprime y se consulta con la app
   * cerrada, que es como se lee una tabla de precios.
   */
  ipcMain.handle(IPC.guideOpen, async () => {
    try {
      const file = join(app.getPath('userData'), 'guia-modelos.html');
      writeFileSync(file, renderModelGuide(await getSystemSpecs()), 'utf-8');
      await shell.openExternal(pathToFileURL(file).href);
      return { ok: true, path: file };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[guide] no se pudo abrir:', message);
      return { ok: false, error: message };
    }
  });

  // ── Espejo en el teléfono ──
  ipcMain.handle(IPC.phoneGetStatus, () => phoneBridge.getStatus());

  // ── Atajos ──
  ipcMain.handle(IPC.hotkeysGetFailed, () => failedHotkeys);

  // ── Diagnóstico ──
  ipcMain.handle(IPC.logsRead, () => readLogTail());
  ipcMain.handle(IPC.logsLocation, () => logLocation());
  ipcMain.handle(IPC.sttTestConnection, () => testSTTConnection(settingsStore.get()));

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

/**
 * Aceleradores que Windows no aceptó en el último registro.
 *
 * Se guarda en lugar de descartarse porque es la única forma de que el usuario
 * se entere: un atajo que otra aplicación tiene tomado no da ningún error al
 * pulsarlo, simplemente no hace nada.
 */
let failedHotkeys: string[] = [];

/** Registra los atajos y difunde qué se quedó fuera. */
function applyHotkeys(): void {
  failedHotkeys = registerHotkeys(hotkeyActions);
  broadcast(IPC.onHotkeyFailures, failedHotkeys);
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
  solveOnScreen: () => {
    void sessionOrchestrator.solveOnScreen('code');
  },
  solveQuiz: () => {
    void sessionOrchestrator.solveOnScreen('quiz');
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

// Inmediatamente después de fijar el nombre, porque la ruta del log sale de
// `userData` y ésta deriva de `app.name`. Antes de esto no había ningún sitio
// donde mirar en el .exe empaquetado.
initLogging();

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

    // El contador de teléfonos conectados cambia sin que nadie toque nada, así
    // que el dashboard no puede enterarse preguntando.
    phoneBridge.on('status', (status: PhoneMirrorStatus) => {
      broadcast(IPC.onPhoneStatus, status);
    });
    // Quedó encendido de la sesión anterior: se respeta. Es un ajuste que se
    // activa a conciencia, y apagarlo solo al arrancar sería perder el ajuste.
    phoneBridge.apply(settingsStore.get());

    createOverlay();
    applyHotkeys();

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
    // Un servidor con clientes SSE abiertos no deja morir al proceso: las
    // conexiones son keep-alive y el event loop sigue teniendo trabajo.
    phoneBridge.stop();
    // El servidor de Whisper es un proceso hijo: si no se mata aquí sobrevive a
    // la app con el modelo entero en memoria.
    whisperServer.stop();
    // Cerrar por cualquier vía (X de la barra, Alt+F4, apagado) debe consolidar
    // el historial; `overlayQuit` no es el único camino de salida.
    sessionOrchestrator.flush();
  });
}
