import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, session, shell } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { IPC } from '@shared/ipc';
import { alignAutoTrigger } from '@shared/types';
import { renderModelGuide } from '@shared/model-guide';
import type {
  LLMProviderId,
  MqttStatus,
  PhoneMirrorStatus,
  ScreenTask,
  SecretKey,
  Settings,
} from '@shared/types';
import { settingsStore } from './config/store';
import { m } from './i18n';
import { clearSecret, getPresence, setSecret } from './config/secrets';
import {
  clearHistory,
  deleteConversation,
  getConversation,
  historyLocation,
  listConversations,
  searchConversations,
} from './config/history';
import {
  createOverlay,
  getOverlay,
  recoverOverlay,
  refreshOverlayTaskbar,
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
import { applyDecoyToAll, decoyPreviews } from './windows/decoy';
import { defaultProfilePrompts } from './core/prompt';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { audioCapture } from './capture/audio';
import { captureScreen } from './capture/screenshot';
// Renamed: `session` collides with Electron's `session` module, and the
// collision silently resolved to Function.prototype.bind.
import { session as sessionOrchestrator } from './core/session';
import { createLLMProvider, listModelsFor } from './llm';
import { probeOllama } from './llm/ollama';
import { listSkills, openSkillsFolder, reloadSkills, skillsFolder } from './skills';
import { ensureWhisperReady, getWhisperStatus } from './stt/whisper-assets';
import { testSTTConnection } from './stt';
import { whisperServer } from './stt/whisper-server';
import { initLogging, logLocation, readLogTail } from './logging';
import { getSystemSpecs } from './system-specs';
import { checkForUpdate } from './update';
import { mqttBridge } from './bridge/mqtt';
import { phoneBridge } from './bridge/phone';
import { installOllama, ollamaInstalled, pullModel, wingetAvailable } from './setup/ollama-install';
import { parseDocument } from './context-parse';

/**
 * Enables system audio capture (loopback).
 *
 * Without this handler, `getDisplayMedia()` in the renderer fails in Electron.
 * `audio: 'loopback'` captures the system's audio output without third-party
 * drivers (supported on Windows 10+ since Electron 31; native since 39).
 */
function enableLoopbackAudio(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const screenSource = sources[0];
      if (!screenSource) {
        // callback with no video cancels the request cleanly.
        callback({});
        return;
      }
      // We ask for video because getDisplayMedia requires it, but the worker
      // discards the video track immediately: we only want the audio.
      callback({ video: screenSource, audio: 'loopback' });
    },
    // The overlay has content protection, so it doesn't leak into the capture.
    { useSystemPicker: false }
  );
}

/**
 * Grants microphone and capture permission only to our own windows.
 *
 * Electron doesn't grant `media` by default and `getUserMedia` would fail with
 * NotAllowedError. We check the origin instead of accepting everything: in dev
 * the renderer is served from Vite's dev server and in production from file://,
 * and nothing else should be able to ask for the microphone.
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
  // The phone mirror hooks in here and not into each emitter: what the overlay
  // sees is exactly what the phone can see, without a separate list that falls
  // out of date. It filters what's useful to it.
  phoneBridge.publish(channel, payload);
}

function registerIpcHandlers(): void {
  // ── Settings ──
  ipcMain.handle(IPC.settingsGet, () => settingsStore.get());

  ipcMain.handle(IPC.settingsUpdate, (_e, rawPatch: Partial<Settings>) => {
    const previous = settingsStore.get();
    // Changing the source can't leave the auto-trigger mute; see
    // `alignAutoTrigger`. It's done here and not in the UI so it holds equally
    // from the overlay and from the dashboard.
    const patch = alignAutoTrigger(previous, rawPatch);
    const next = settingsStore.update(patch);

    if (patch.autoTriggerSpeaker && patch.autoTriggerSpeaker !== previous.autoTriggerSpeaker) {
      console.log(
        `[auto] el disparo pasa a "${patch.autoTriggerSpeaker}" para seguir a ` +
          `audioSources="${next.audioSources}"`
      );
      // It's said: it's a setting the user didn't ask for, even if it's the one
      // that makes what they did ask for work.
      broadcast(
        IPC.onNotice,
        m(patch.autoTriggerSpeaker === 'them' ? 'notice.nowThem' : 'notice.nowMe')
      );
    }

    if (patch.stealthEnabled !== undefined && patch.stealthEnabled !== previous.stealthEnabled) {
      setStealthForAll(next.stealthEnabled);
    }
    if (patch.decoyIcon !== undefined && patch.decoyIcon !== previous.decoyIcon) {
      applyDecoyToAll(next.decoyIcon);
      // The icon is set, but the taskbar button caches it; recreate it so the
      // change shows without needing a stealth toggle.
      refreshOverlayTaskbar();
    }
    if (patch.clickThrough !== undefined) {
      const overlay = getOverlay();
      if (overlay) setClickThrough(overlay, next.clickThrough);
    }
    // Turning one on or off changes what's registered just like reassigning it.
    // The teleprompter too: its two shortcuts only exist with the mode active.
    if (patch.hotkeys || patch.disabledHotkeys || patch.teleprompterEnabled !== undefined) {
      applyHotkeys();
    }
    if (patch.overlaySize && patch.overlaySize !== previous.overlaySize) {
      setOverlaySize(next.overlaySize);
    }
    /*
     * Changing what's listened to requires reopening the streams.
     *
     * `audioSources` is only read inside `capture.start()`, and the STT engine's
     * speakers are fixed when transcription starts. Without this, changing the
     * source mid-session did absolutely nothing: the UI updated, the setting was
     * saved, and it kept listening to the old thing until someone stopped and
     * started again by hand.
     */
    if (
      patch.audioSources &&
      patch.audioSources !== previous.audioSources &&
      audioCapture.getStatus().state === 'listening'
    ) {
      audioCapture.stop();
      void audioCapture.start();
    }
    // Turning off history mid-conversation must also cut the one in progress; if
    // not, it would stay in memory and go back to disk when reactivated.
    if (patch.historyEnabled === false && previous.historyEnabled) {
      sessionOrchestrator.newConversation();
    }
    // The mirror is applied from here, not from the UI, so the server's state
    // doesn't depend on which window touched the switch.
    if (patch.phoneMirrorEnabled !== undefined || patch.phoneMirrorLan !== undefined) {
      phoneBridge.apply(next);
    }
    // Same with the broker: changing the URL, the user or the topic forces a
    // reconnect, because the MQTT client fixes them on connect.
    if (
      patch.mqttEnabled !== undefined ||
      patch.mqttUrl !== undefined ||
      patch.mqttTopic !== undefined ||
      patch.mqttUsername !== undefined
    ) {
      mqttBridge.apply(next);
    }
    return next;
  });

  // ── Secrets (the keys never go out to the renderer) ──
  ipcMain.handle(IPC.secretsGetPresence, () => getPresence());
  // The type is `SecretKey` and not a hand-written list: this one had already
  // fallen behind with the MQTT password —which was saved anyway, because the
  // preload does send the right type— and would fall behind again with the next
  // provider. A shared `Record` is what makes the build catch it.
  /*
   * Both broadcast the presence in addition to returning it.
   *
   * The one that changes it is the dashboard, but the one that needs it is also
   * the overlay: its "AI not configured" warning comes from here. Without the
   * broadcast, pasting the missing key left the warning up until restart, which
   * is exactly the moment someone concludes the app is broken.
   */
  ipcMain.handle(IPC.secretsSet, (_e, key: SecretKey, value: string) => {
    setSecret(key, value);
    const presence = getPresence();
    broadcast(IPC.onSecrets, presence);
    return presence;
  });
  ipcMain.handle(IPC.secretsClear, (_e, key: SecretKey) => {
    clearSecret(key);
    const presence = getPresence();
    broadcast(IPC.onSecrets, presence);
    return presence;
  });

  // ── Windows ──
  ipcMain.handle(IPC.decoyPreviews, () => decoyPreviews());
  ipcMain.handle(IPC.profileDefaults, () => defaultProfilePrompts(settingsStore.get().uiLanguage));
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

  // Writing mode: the only path by which the overlay takes focus, and always at
  // the user's explicit request (opening the writing tab).
  ipcMain.handle(IPC.overlayInteractive, (_e, interactive: boolean) =>
    setOverlayInteractive(interactive)
  );
  ipcMain.handle(IPC.overlayResize, (_e, height: number) => resizeOverlay(height));
  ipcMain.handle(IPC.dashboardOpen, () => {
    openDashboard();
  });

  // The dashboard's own title bar (frame: false). They act on the window that
  // emits, so they work even if there's another window with its own frame in the
  // future. Close closes ONLY that window —the overlay is the app—, just like the
  // native X before.
  ipcMain.on(IPC.dashboardMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on(IPC.dashboardToggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on(IPC.dashboardClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close());

  // Parsing of context files (PDF, Word) → plain text. The renderer sends the
  // bytes; .txt/.md don't even pass through here (it reads them with FileReader).
  ipcMain.handle(IPC.contextParseFile, (_e, payload: { name: string; data: ArrayBuffer }) =>
    parseDocument(payload.name, payload.data)
  );

  // High traffic (one event per mousemove), so they go through `on` and not `handle`.
  ipcMain.on(IPC.overlayMouseIgnore, (_e, ignore: boolean) => setOverlayMouseIgnore(ignore));
  ipcMain.on(IPC.overlayDragStart, () => startOverlayDrag());
  ipcMain.on(IPC.overlayDragEnd, () => stopOverlayDrag());

  // The overlay's X closes the whole app: the overlay IS the application. To hide
  // it temporarily there's Ctrl+Shift+H.
  ipcMain.handle(IPC.overlayQuit, () => {
    audioCapture.stop();
    // Flush before exiting: whatever was left in the debounce would be lost.
    sessionOrchestrator.flush();
    app.quit();
  });

  // ── Audio capture ──
  ipcMain.handle(IPC.captureStart, () => audioCapture.start());
  ipcMain.handle(IPC.captureStop, () => audioCapture.stop());
  ipcMain.handle(IPC.captureGetStatus, () => audioCapture.getStatus());

  // ── Answers ──
  ipcMain.handle(IPC.askNow, () => sessionOrchestrator.ask('hotkey'));
  ipcMain.handle(IPC.askWithText, (_e, text: string) => sessionOrchestrator.askWithText(text));
  ipcMain.handle(IPC.askAbort, () => sessionOrchestrator.abortAnswer());
  ipcMain.handle(IPC.askSolveScreen, (_e, task: ScreenTask = 'code') =>
    sessionOrchestrator.solveOnScreen(task)
  );
  ipcMain.handle(IPC.askForgetContext, () => sessionOrchestrator.forgetContext());
  ipcMain.handle(IPC.askContinue, () => sessionOrchestrator.answers.continueAnswer());
  ipcMain.handle(IPC.memoryGet, () => sessionOrchestrator.answers.memory);

  // Chunk capture: the overlay chip's buttons solve or empty the stack. The
  // shortcuts do the same from main (see hotkeyActions).
  ipcMain.handle(IPC.scrollCaptureSolve, () => sessionOrchestrator.solveCaptureStack());
  ipcMain.handle(IPC.scrollCaptureClear, () => sessionOrchestrator.clearCaptureStack());

  // ── Screenshots ──
  ipcMain.handle(IPC.screenshotTake, async () => {
    const image = await captureScreen();
    if (image) {
      sessionOrchestrator.attachImage(image);
      broadcast(IPC.onScreenshot, image);
    }
    return image;
  });

  // ── Clipboard ──
  // Lives in main because in the overlay there's no alternative: see `IPC.clipboardWrite`.
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string) => {
    clipboard.writeText(text);
  });

  // ── Conversation history ──
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
    // The conversation in progress is cut before deleting: if not, the pending
    // debounce would write to disk again right after emptying the folder.
    sessionOrchestrator.newConversation();
    clearHistory();
    return listConversations();
  });
  ipcMain.handle(IPC.historyLocation, () => historyLocation());
  ipcMain.handle(IPC.historySearch, (_e, query: string) => searchConversations(query));

  // ── Models ──
  // With `providerId` you can populate the selector of a provider that is NOT
  // the active one, which is what the separate screen model needs.
  ipcMain.handle(IPC.llmListModels, (_e, providerId?: LLMProviderId) => {
    const settings = settingsStore.get();
    return listModelsFor(providerId ?? settings.llmProviderId, settings);
  });

  // ── Skills ──
  ipcMain.handle(IPC.skillsList, () => listSkills());
  ipcMain.handle(IPC.skillsReload, () => reloadSkills());
  ipcMain.handle(IPC.skillsOpenFolder, () => openSkillsFolder());
  ipcMain.handle(IPC.skillsFolder, () => skillsFolder());

  /*
   * With `providerId` a provider that is NOT the active one is tested.
   *
   * The button next to each API key asks for it: the question there is "does this
   * key work?", and forcing a provider switch to find out turned a check into a
   * configuration change you then have to undo.
   */
  ipcMain.handle(IPC.llmTestConnection, async (_e, providerId?: LLMProviderId) => {
    try {
      const settings = settingsStore.get();
      const target = providerId ? { ...settings, llmProviderId: providerId } : settings;
      return await createLLMProvider(target).testConnection();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC.appGetInfo, () => ({
    version: app.getVersion(),
    author: '@cflarios',
  }));

  ipcMain.handle(IPC.appCheckUpdate, () => checkForUpdate());

  // ── Ollama ──
  ipcMain.handle(IPC.ollamaGetStatus, () => probeOllama(settingsStore.get().ollamaBaseUrl));

  // ── Machine ──
  ipcMain.handle(IPC.systemGetSpecs, () => getSystemSpecs());

  // Opens an external link in the system browser. The scheme is validated —only
  // http(s)— so this can't turn into a `file://` or a `javascript:` if some day
  // the URL stops being a code constant.
  ipcMain.handle(IPC.systemOpenExternal, (_e, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
  });

  /*
   * The model guide, as a document.
   *
   * It's written to `userData` and opened with the system browser. Two reasons
   * not to stand up a window of its own: every Electron window has to be
   * registered in the capture protection —and invisible mode is verified, not
   * assumed—, and an HTML on disk is saved, printed and consulted with the app
   * closed, which is how you read a pricing table.
   */
  ipcMain.handle(IPC.guideOpen, async () => {
    try {
      const file = join(app.getPath('userData'), 'model-guide.html');
      const specs = await getSystemSpecs();
      writeFileSync(file, renderModelGuide(specs, settingsStore.get().uiLanguage), 'utf-8');
      await shell.openExternal(pathToFileURL(file).href);
      return { ok: true, path: file };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[guide] no se pudo abrir:', message);
      return { ok: false, error: message };
    }
  });

  // ── Phone mirror ──
  ipcMain.handle(IPC.phoneGetStatus, () => phoneBridge.getStatus());

  // ── MQTT broker ──
  ipcMain.handle(IPC.mqttGetStatus, () => mqttBridge.getStatus());
  ipcMain.handle(IPC.mqttTest, () => mqttBridge.test());

  /*
   * ── Setup wizard ──
   *
   * The two handlers install or download things, so they're only called from a
   * button that already said what it was going to do. `canInstall` exists so the
   * wizard offers the button only when there's a clean path: with no winget, it
   * shows the link to ollama.com instead of a button that's going to fail.
   */
  ipcMain.handle(IPC.setupCanInstall, () => wingetAvailable());
  ipcMain.handle(IPC.setupOllamaInstalled, () => ollamaInstalled());

  ipcMain.handle(IPC.setupInstallOllama, () =>
    installOllama(settingsStore.get().ollamaBaseUrl, (progress) =>
      broadcast(IPC.onSetupProgress, progress)
    )
  );

  ipcMain.handle(IPC.setupPullModel, (_e, model: string) =>
    pullModel(settingsStore.get().ollamaBaseUrl, model, (progress) =>
      broadcast(IPC.onSetupProgress, progress)
    )
  );

  // ── Shortcuts ──
  ipcMain.handle(IPC.hotkeysGetFailed, () => failedHotkeys);

  // ── Diagnostics ──
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
 * Accelerators Windows didn't accept in the last registration.
 *
 * It's kept instead of discarded because it's the only way for the user to find
 * out: a shortcut another application holds gives no error when pressed, it
 * simply does nothing.
 */
let failedHotkeys: string[] = [];

/** Registers the shortcuts and broadcasts what was left out. */
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
      // It always asks, with or without a capture: if the capture failed it's
      // better to answer without it than answer nothing.
      return sessionOrchestrator.ask('hotkey');
    });
  },
  solveOnScreen: () => {
    void sessionOrchestrator.solveOnScreen('code');
  },
  solveQuiz: () => {
    void sessionOrchestrator.solveOnScreen('quiz');
  },
  captureFrame: () => sessionOrchestrator.onCaptureHotkey(),
  solveCapture: () => {
    void sessionOrchestrator.solveCaptureStack();
  },
  toggleListening: () => {
    void audioCapture.toggle();
  },
  // The overlay isn't focused, so it can't hear the key on its own: the global
  // shortcut arrives here and the step is forwarded to it.
  teleprompterNext: () => broadcast(IPC.onTeleprompterMove, 1),
  teleprompterPrev: () => broadcast(IPC.onTeleprompterMove, -1),
};

// The userData folder is `%APPDATA%\Tayori`, and it comes from `app.name`, which
// Electron resolves from `productName` ("Tayori", set in both package.json and
// electron-builder.yml). This `setName` reinforces it and must run BEFORE any
// getPath('userData'). `package.json` `name` stays `interview-helper` (npm wants a
// lowercase id; it's only the fallback if productName vanished). Changing the
// resolved name orphans the settings and the DPAPI-encrypted API key in the old
// folder, with no error to give it away — so all three signals say `Tayori`.
app.setName('Tayori');

// Immediately after setting the name, because the log path comes from
// `userData` and that derives from `app.name`. Before this there was nowhere to
// look in the packaged .exe.
initLogging();

// A single instance: two processes fighting over the same global hotkeys and the
// same settings file is a source of hard-to-see bugs.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Trying to open a second instance recovers the overlay instead of starting
  // another app; it's the escape hatch if it was hidden and the shortcut isn't
  // remembered.
  app.on('second-instance', () => {
    // Recover the overlay even when it's still "visible" but buried behind
    // another window (Windows dropped its topmost): re-assert always-on-top and
    // raise it, not just re-show it when hidden.
    recoverOverlay();
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.interviewhelper.app');

    app.on('browser-window-created', (_, win) => {
      optimizer.watchWindowShortcuts(win);
    });

    enableLoopbackAudio();
    registerPermissionHandlers();
    audioCapture.registerHandlers();
    // Must go after registerHandlers: the orchestrator subscribes to the events
    // the capture controller emits.
    sessionOrchestrator.bind();
    registerIpcHandlers();

    // Warms the specs cache (GPU included) in the background: that way the first
    // visit to Models or Transcription finds it ready instead of waiting for
    // `getGPUInfo`. It doesn't block startup —it's fire-and-forget— or the overlay.
    void getSystemSpecs();

    settingsStore.on('change', (settings: Settings) => {
      broadcast(IPC.onSettings, settings);
    });

    // The connected-phones counter changes without anyone touching anything, so
    // the dashboard can't find out by asking.
    phoneBridge.on('status', (status: PhoneMirrorStatus) => {
      broadcast(IPC.onPhoneStatus, status);
    });
    // Left on from the previous session: it's respected. It's a setting turned on
    // deliberately, and turning it off on its own at startup would be losing the
    // setting.
    phoneBridge.apply(settingsStore.get());

    mqttBridge.on('status', (status: MqttStatus) => {
      broadcast(IPC.onMqttStatus, status);
    });
    mqttBridge.apply(settingsStore.get());

    createOverlay();
    applyHotkeys();

    // The dashboard does NOT open on its own, not even on the first launch: only
    // with the overlay's gear. When the keys are missing, the overlay shows a
    // call to action that points to that button.
  });

  // On Windows the overlay is the app: if it closes, there's nothing left to do.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    unregisterHotkeys();
    // A server with open SSE clients won't let the process die: the connections
    // are keep-alive and the event loop still has work.
    phoneBridge.stop();
    // An MQTT client with automatic reconnection keeps the event loop alive.
    mqttBridge.stop();
    // The Whisper server is a child process: if it's not killed here it outlives
    // the app with the whole model in memory.
    whisperServer.stop();
    // Closing by any route (bar's X, Alt+F4, shutdown) must consolidate the
    // history; `overlayQuit` isn't the only exit path.
    sessionOrchestrator.flush();
  });
}
