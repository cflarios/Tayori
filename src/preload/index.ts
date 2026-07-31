import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AudioChunkMessage,
  type CaptureCommand,
  type WhisperProgress,
} from '@shared/ipc';
import type {
  Answer,
  AudioLevels,
  CaptureStatus,
  Conversation,
  ConversationSummary,
  ImageAttachment,
  LLMProviderId,
  ModelInfo,
  OllamaStatus,
  ScreenTask,
  SecretKey,
  SecretsPresence,
  Settings,
  SystemSpecs,
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

    /**
     * Alterna si el overlay deja pasar el ratón. Se envía con `send` y no con
     * `invoke` porque se dispara en cada mousemove: esperar una respuesta por
     * cada uno añadiría latencia al hover sin ninguna ventaja.
     */
    setMouseIgnore: (ignore: boolean): void =>
      ipcRenderer.send(IPC.overlayMouseIgnore, ignore),

    /**
     * Vuelve el overlay enfocable para poder escribir en él. Se envía con
     * `invoke` y no con `send` porque el renderer necesita saber que ya se
     * aplicó antes de enfocar el textarea.
     */
    setInteractive: (interactive: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.overlayInteractive, interactive),
    startDrag: (): void => ipcRenderer.send(IPC.overlayDragStart),
    endDrag: (): void => ipcRenderer.send(IPC.overlayDragEnd),
    quit: (): Promise<void> => ipcRenderer.invoke(IPC.overlayQuit),
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
    /** Fallos del motor de transcripción, para poder enseñarlos en la UI. */
    onError: (cb: (message: string) => void) => subscribe<string>(IPC.onSTTError, cb),
    /** El detector decidió no responder, y por qué. */
    onAutoSkip: (cb: (info: { text: string; reason: string }) => void) =>
      subscribe<{ text: string; reason: string }>(IPC.onAutoSkip, cb),
    testConnection: (): Promise<{ ok: boolean; detail: string }> =>
      ipcRenderer.invoke(IPC.sttTestConnection),
  },

  /**
   * Copiar al portapapeles. Pasa por el main a la fuerza: `navigator.clipboard`
   * exige foco, y el overlay no lo toma nunca. Ver `IPC.clipboardWrite`.
   */
  clipboard: {
    write: (text: string): Promise<void> => ipcRenderer.invoke(IPC.clipboardWrite, text),
  },

  /** Avisos que no vienen del audio (fallo de captura de pantalla, etc.). */
  notices: {
    on: (cb: (message: string) => void) => subscribe<string>(IPC.onNotice, cb),
  },

  /** Cuántos intercambios reenvía el asistente en cada consulta. */
  memory: {
    get: (): Promise<{ turns: number; max: number }> => ipcRenderer.invoke(IPC.memoryGet),
    onChange: (cb: (m: { turns: number; max: number }) => void) =>
      subscribe<{ turns: number; max: number }>(IPC.onMemory, cb),
  },

  hotkeys: {
    /** Aceleradores que Windows rechazó; el dashboard los marca en rojo. */
    getFailed: (): Promise<string[]> => ipcRenderer.invoke(IPC.hotkeysGetFailed),
    onFailures: (cb: (failed: string[]) => void) =>
      subscribe<string[]>(IPC.onHotkeyFailures, cb),
  },

  logs: {
    read: (): Promise<string> => ipcRenderer.invoke(IPC.logsRead),
    location: (): Promise<string> => ipcRenderer.invoke(IPC.logsLocation),
  },

  ask: {
    now: (): Promise<void> => ipcRenderer.invoke(IPC.askNow),
    withText: (text: string): Promise<void> => ipcRenderer.invoke(IPC.askWithText, text),
    abort: (): Promise<void> => ipcRenderer.invoke(IPC.askAbort),
    /** Captura la pantalla y resuelve lo que haya en ella: código o test. */
    solveOnScreen: (task: ScreenTask = 'code'): Promise<void> =>
      ipcRenderer.invoke(IPC.askSolveScreen, task),
    /** Vacía la memoria del asistente sin tocar la conversación. */
    forgetContext: (): Promise<{ turns: number; max: number }> =>
      ipcRenderer.invoke(IPC.askForgetContext),
    onAnswer: (cb: (a: Answer) => void) => subscribe<Answer>(IPC.onAnswer, cb),
  },

  screenshot: {
    take: (): Promise<ImageAttachment | null> => ipcRenderer.invoke(IPC.screenshotTake),
    onCaptured: (cb: (img: ImageAttachment) => void) =>
      subscribe<ImageAttachment>(IPC.onScreenshot, cb),
  },

  history: {
    /** Empieza una conversación nueva y limpia el contexto en curso. */
    newConversation: (): Promise<void> => ipcRenderer.invoke(IPC.conversationNew),
    list: (): Promise<ConversationSummary[]> => ipcRenderer.invoke(IPC.historyList),
    get: (id: string): Promise<Conversation | null> => ipcRenderer.invoke(IPC.historyGet, id),
    remove: (id: string): Promise<ConversationSummary[]> =>
      ipcRenderer.invoke(IPC.historyDelete, id),
    clear: (): Promise<ConversationSummary[]> => ipcRenderer.invoke(IPC.historyClear),
    location: (): Promise<string> => ipcRenderer.invoke(IPC.historyLocation),
    onReset: (cb: () => void) => subscribe<null>(IPC.onConversationReset, cb),
  },

  llm: {
    listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.llmListModels),
    /** Modelos de un proveedor concreto, aunque no sea el activo. */
    listModelsFor: (providerId: LLMProviderId): Promise<ModelInfo[]> =>
      ipcRenderer.invoke(IPC.llmListModels, providerId),
    testConnection: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.llmTestConnection),
  },

  whisper: {
    getStatus: (): Promise<{ binaryInstalled: boolean; modelInstalled: boolean }> =>
      ipcRenderer.invoke(IPC.whisperGetStatus),
    install: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.whisperInstall),
    onProgress: (cb: (p: WhisperProgress) => void) =>
      subscribe<WhisperProgress>(IPC.onWhisperProgress, cb),
  },

  ollama: {
    getStatus: (): Promise<OllamaStatus> => ipcRenderer.invoke(IPC.ollamaGetStatus),
  },

  /** RAM, CPU y GPU: lo que necesita la guía de modelos locales. */
  system: {
    getSpecs: (): Promise<SystemSpecs> => ipcRenderer.invoke(IPC.systemGetSpecs),
  },

  /** La guía completa de modelos, generada y abierta en el navegador. */
  guide: {
    open: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.guideOpen),
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
    reportStarted: (info: { micActive: boolean; loopbackActive: boolean }): void =>
      ipcRenderer.send(IPC.audioWorkerStarted, info),
    reportStopped: (): void => ipcRenderer.send(IPC.audioWorkerStopped),
    reportError: (message: string): void => ipcRenderer.send(IPC.audioWorkerError, message),
  },
} as const;

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
