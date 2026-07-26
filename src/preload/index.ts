import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AudioChunkMessage, type CaptureCommand } from '@shared/ipc';
import type {
  Answer,
  AudioLevels,
  CaptureStatus,
  ImageAttachment,
  ModelInfo,
  SecretKey,
  SecretsPresence,
  Settings,
  TranscriptSegment,
} from '@shared/types';

/**
 * Puente IPC expuesto al renderer.
 *
 * `contextIsolation` está activo y `nodeIntegration` desactivado: el renderer
 * no tiene acceso a Node ni a `ipcRenderer` directamente, sólo a estos métodos.
 * Ninguno de ellos puede devolver una API key.
 */

/** Helper para suscripciones: devuelve la función de baja para usar en useEffect. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    onChange: (cb: (s: Settings) => void) => subscribe<Settings>(IPC.onSettings, cb),
  },

  secrets: {
    getPresence: (): Promise<SecretsPresence> => ipcRenderer.invoke(IPC.secretsGetPresence),
    set: (key: SecretKey, value: string): Promise<SecretsPresence> =>
      ipcRenderer.invoke(IPC.secretsSet, key, value),
    clear: (key: SecretKey): Promise<SecretsPresence> => ipcRenderer.invoke(IPC.secretsClear, key),
  },

  window: {
    setStealth: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.stealthSet, enabled),
    setClickThrough: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.clickThroughSet, enabled),
    hideOverlay: (): Promise<void> => ipcRenderer.invoke(IPC.overlayHide),
    resizeOverlay: (height: number): Promise<void> =>
      ipcRenderer.invoke(IPC.overlayResize, height),
    openDashboard: (): Promise<void> => ipcRenderer.invoke(IPC.dashboardOpen),
  },

  capture: {
    start: (): Promise<CaptureStatus> => ipcRenderer.invoke(IPC.captureStart),
    stop: (): Promise<CaptureStatus> => ipcRenderer.invoke(IPC.captureStop),
    getStatus: (): Promise<CaptureStatus> => ipcRenderer.invoke(IPC.captureGetStatus),
    onStatus: (cb: (s: CaptureStatus) => void) =>
      subscribe<CaptureStatus>(IPC.onCaptureStatus, cb),
    onLevels: (cb: (l: AudioLevels) => void) => subscribe<AudioLevels>(IPC.onAudioLevels, cb),
  },

  transcript: {
    onSegment: (cb: (s: TranscriptSegment) => void) =>
      subscribe<TranscriptSegment>(IPC.onTranscript, cb),
  },

  ask: {
    now: (): Promise<void> => ipcRenderer.invoke(IPC.askNow),
    withText: (text: string): Promise<void> => ipcRenderer.invoke(IPC.askWithText, text),
    abort: (): Promise<void> => ipcRenderer.invoke(IPC.askAbort),
    onAnswer: (cb: (a: Answer) => void) => subscribe<Answer>(IPC.onAnswer, cb),
  },

  screenshot: {
    take: (): Promise<ImageAttachment | null> => ipcRenderer.invoke(IPC.screenshotTake),
    onCaptured: (cb: (img: ImageAttachment) => void) =>
      subscribe<ImageAttachment>(IPC.onScreenshot, cb),
  },

  llm: {
    listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.llmListModels),
    testConnection: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.llmTestConnection),
  },

  /**
   * Sólo lo usa la ventana `audio-worker`. Va aquí y no en un preload aparte
   * para no duplicar el bundle; el overlay y el dashboard simplemente lo ignoran.
   */
  audioWorker: {
    onCommand: (cb: (c: CaptureCommand) => void) =>
      subscribe<CaptureCommand>(IPC.onCaptureCommand, cb),
    sendChunk: (msg: AudioChunkMessage): void => ipcRenderer.send(IPC.audioChunk, msg),
    sendLevels: (levels: AudioLevels): void => ipcRenderer.send(IPC.audioLevels, levels),
    reportReady: (): void => ipcRenderer.send(IPC.audioWorkerReady),
    reportError: (message: string): void => ipcRenderer.send(IPC.audioWorkerError, message),
  },
} as const;

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
