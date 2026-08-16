import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AudioChunkMessage,
  type CaptureCommand,
  type ScrollCaptureState,
  type WhisperProgress,
} from '@shared/ipc';
import type {
  Answer,
  AudioLevels,
  CaptureStatus,
  Conversation,
  DecoyIcon,
  ConversationSummary,
  ImageAttachment,
  LLMProviderId,
  ModelInfo,
  MqttStatus,
  OllamaStatus,
  PhoneMirrorStatus,
  ScreenTask,
  SecretKey,
  SecretsPresence,
  SetupProgress,
  Settings,
  Skill,
  SystemSpecs,
  TranscriptSegment,
  UpdateInfo,
} from '@shared/types';

/**
 * IPC bridge exposed to the renderer.
 *
 * `contextIsolation` is on and `nodeIntegration` off: the renderer has no access
 * to Node or to `ipcRenderer` directly, only to these methods. None of them can
 * return an API key.
 */

/** Subscription helper: returns the unsubscribe function to use in useEffect. */
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
    /** Default prompt text per built-in profile, for the dashboard editor. */
    profileDefaults: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke(IPC.profileDefaults),
  },

  secrets: {
    getPresence: (): Promise<SecretsPresence> => ipcRenderer.invoke(IPC.secretsGetPresence),
    set: (key: SecretKey, value: string): Promise<SecretsPresence> =>
      ipcRenderer.invoke(IPC.secretsSet, key, value),
    clear: (key: SecretKey): Promise<SecretsPresence> => ipcRenderer.invoke(IPC.secretsClear, key),
    /**
     * A key was saved or deleted, in any window.
     *
     * The overlay listens to it: its «The AI needs configuring» warning depends
     * on this, and without the event it was stuck with the startup answer. The
     * presence travels —four booleans—, never a key.
     */
    onChange: (cb: (p: SecretsPresence) => void) => subscribe<SecretsPresence>(IPC.onSecrets, cb),
  },

  window: {
    setStealth: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.stealthSet, enabled),
    setClickThrough: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.clickThroughSet, enabled),
    hideOverlay: (): Promise<void> => ipcRenderer.invoke(IPC.overlayHide),
    resizeOverlay: (height: number, width?: number): Promise<void> =>
      ipcRenderer.invoke(IPC.overlayResize, height, width),
    /** Preview images (data URLs) of the decoy taskbar icons, for the picker. */
    decoyPreviews: (): Promise<Record<DecoyIcon, string>> =>
      ipcRenderer.invoke(IPC.decoyPreviews),
    openDashboard: (): Promise<void> => ipcRenderer.invoke(IPC.dashboardOpen),

    /**
     * Controls for the dashboard's own title bar (frameless window). They go by
     * `send`: they're a one-off click and need no response. `close` closes ONLY
     * the dashboard —the overlay is the app and stays alive—.
     */
    minimizeDashboard: (): void => ipcRenderer.send(IPC.dashboardMinimize),
    toggleMaximizeDashboard: (): void => ipcRenderer.send(IPC.dashboardToggleMaximize),
    closeDashboard: (): void => ipcRenderer.send(IPC.dashboardClose),

    /**
     * Toggles whether the overlay lets the mouse through. It's sent with `send`
     * and not `invoke` because it fires on every mousemove: waiting for a response
     * on each one would add latency to the hover with no advantage.
     */
    setMouseIgnore: (ignore: boolean): void => ipcRenderer.send(IPC.overlayMouseIgnore, ignore),

    /**
     * The main process asks to re-sync the mouse tracking (after the dashboard
     * closes, which interrupts the mousemove forwarding). See `useChromeMouse`.
     */
    onResync: (cb: () => void): (() => void) => subscribe<void>(IPC.onOverlayResync, cb),

    /**
     * Makes the overlay focusable so you can write in it. It's sent with `invoke`
     * and not `send` because the renderer needs to know it's already applied
     * before focusing the textarea.
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
    onStatus: (cb: (s: CaptureStatus) => void) => subscribe<CaptureStatus>(IPC.onCaptureStatus, cb),
    onLevels: (cb: (l: AudioLevels) => void) => subscribe<AudioLevels>(IPC.onAudioLevels, cb),
  },

  transcript: {
    onSegment: (cb: (s: TranscriptSegment) => void) =>
      subscribe<TranscriptSegment>(IPC.onTranscript, cb),
    /** Transcription engine failures, to be able to show them in the UI. */
    onError: (cb: (message: string) => void) => subscribe<string>(IPC.onSTTError, cb),
    /** The detector decided not to answer, and why. */
    onAutoSkip: (cb: (info: { text: string; reason: string }) => void) =>
      subscribe<{ text: string; reason: string }>(IPC.onAutoSkip, cb),
    testConnection: (): Promise<{ ok: boolean; detail: string }> =>
      ipcRenderer.invoke(IPC.sttTestConnection),
  },

  /**
   * Copy to the clipboard. Goes through the main process by force:
   * `navigator.clipboard` requires focus, and the overlay never takes it. See
   * `IPC.clipboardWrite`.
   */
  clipboard: {
    write: (text: string): Promise<void> => ipcRenderer.invoke(IPC.clipboardWrite, text),
    readImage: (): Promise<ImageAttachment | null> => ipcRenderer.invoke(IPC.clipboardReadImage),
  },

  /**
   * Context: extracts text from a file (PDF, Word) in the main process. The
   * .txt/.md ones are read by the renderer with FileReader and don't reach here.
   */
  context: {
    parseFile: (
      name: string,
      data: ArrayBuffer
    ): Promise<{ ok: true; text: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke(IPC.contextParseFile, { name, data }),
  },

  /**
   * Chunk capture. The state (how many chunks, whether recording) arrives by
   * event and the overlay chip paints it; solve and clear are the chip's buttons.
   */
  scrollCapture: {
    onChange: (cb: (s: ScrollCaptureState) => void) =>
      subscribe<ScrollCaptureState>(IPC.onScrollCapture, cb),
    solve: (): Promise<void> => ipcRenderer.invoke(IPC.scrollCaptureSolve),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.scrollCaptureClear),
  },

  /** Notices that don't come from the audio (screen-capture failure, etc.). */
  notices: {
    on: (cb: (message: string) => void) => subscribe<string>(IPC.onNotice, cb),
  },

  /** Teleprompter: advance or go back one line, from the global shortcut. */
  teleprompter: {
    onMove: (cb: (step: number) => void) => subscribe<number>(IPC.onTeleprompterMove, cb),
  },

  /** How many exchanges the assistant resends on each query. */
  memory: {
    get: (): Promise<{ turns: number; max: number }> => ipcRenderer.invoke(IPC.memoryGet),
    onChange: (cb: (m: { turns: number; max: number }) => void) =>
      subscribe<{ turns: number; max: number }>(IPC.onMemory, cb),
  },

  hotkeys: {
    /** Accelerators Windows rejected; the dashboard marks them in red. */
    getFailed: (): Promise<string[]> => ipcRenderer.invoke(IPC.hotkeysGetFailed),
    onFailures: (cb: (failed: string[]) => void) => subscribe<string[]>(IPC.onHotkeyFailures, cb),
  },

  logs: {
    read: (): Promise<string> => ipcRenderer.invoke(IPC.logsRead),
    location: (): Promise<string> => ipcRenderer.invoke(IPC.logsLocation),
  },

  /**
   * Phone mirror. Read-only: turning it on and off are normal settings, so they
   * go through `settings.update` and not through a channel of their own.
   */
  phone: {
    getStatus: (): Promise<PhoneMirrorStatus> => ipcRenderer.invoke(IPC.phoneGetStatus),
    onStatus: (cb: (status: PhoneMirrorStatus) => void) =>
      subscribe<PhoneMirrorStatus>(IPC.onPhoneStatus, cb),
  },

  /**
   * MQTT broker. Read-only and one test: turning it on and pointing it at a
   * broker are normal settings and go through `settings.update`.
   */
  mqtt: {
    getStatus: (): Promise<MqttStatus> => ipcRenderer.invoke(IPC.mqttGetStatus),
    /** Publishes a test message to check the setup in one go. */
    test: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(IPC.mqttTest),
    onStatus: (cb: (status: MqttStatus) => void) => subscribe<MqttStatus>(IPC.onMqttStatus, cb),
  },

  /**
   * Setup wizard. The two actions that touch the machine —install Ollama and
   * download a model— are only triggered from a button that already explained
   * what it was going to do and how much it takes up.
   */
  setup: {
    /** `false` when there's no winget: then the link is offered, not the button. */
    canInstall: (): Promise<boolean> => ipcRenderer.invoke(IPC.setupCanInstall),
    /** Whether Ollama is installed, its server running or not. */
    ollamaInstalled: (): Promise<boolean> => ipcRenderer.invoke(IPC.setupOllamaInstalled),
    installOllama: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.setupInstallOllama),
    pullModel: (model: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.setupPullModel, model),
    onProgress: (cb: (progress: SetupProgress) => void) =>
      subscribe<SetupProgress>(IPC.onSetupProgress, cb),
  },

  ask: {
    now: (): Promise<void> => ipcRenderer.invoke(IPC.askNow),
    withText: (text: string, images: ImageAttachment[] = []): Promise<void> =>
      ipcRenderer.invoke(IPC.askWithText, text, images),
    abort: (): Promise<void> => ipcRenderer.invoke(IPC.askAbort),
    /** Captures the screen and solves whatever is on it: code or quiz. */
    solveOnScreen: (task: ScreenTask = 'code'): Promise<void> =>
      ipcRenderer.invoke(IPC.askSolveScreen, task),
    /** Clears the assistant's memory without touching the conversation. */
    forgetContext: (): Promise<{ turns: number; max: number }> =>
      ipcRenderer.invoke(IPC.askForgetContext),
    /** Extends the last code answer, appending to the same answer. */
    continue: (): Promise<void> => ipcRenderer.invoke(IPC.askContinue),
    onAnswer: (cb: (a: Answer) => void) => subscribe<Answer>(IPC.onAnswer, cb),
  },

  screenshot: {
    take: (): Promise<ImageAttachment | null> => ipcRenderer.invoke(IPC.screenshotTake),
    grab: (): Promise<ImageAttachment | null> => ipcRenderer.invoke(IPC.screenshotGrab),
    onCaptured: (cb: (img: ImageAttachment) => void) =>
      subscribe<ImageAttachment>(IPC.onScreenshot, cb),
  },

  history: {
    /** Starts a new conversation and clears the in-progress context. */
    newConversation: (): Promise<void> => ipcRenderer.invoke(IPC.conversationNew),
    list: (): Promise<ConversationSummary[]> => ipcRenderer.invoke(IPC.historyList),
    search: (query: string): Promise<ConversationSummary[]> =>
      ipcRenderer.invoke(IPC.historySearch, query),
    get: (id: string): Promise<Conversation | null> => ipcRenderer.invoke(IPC.historyGet, id),
    remove: (id: string): Promise<ConversationSummary[]> =>
      ipcRenderer.invoke(IPC.historyDelete, id),
    clear: (): Promise<ConversationSummary[]> => ipcRenderer.invoke(IPC.historyClear),
    location: (): Promise<string> => ipcRenderer.invoke(IPC.historyLocation),
    onReset: (cb: () => void) => subscribe<null>(IPC.onConversationReset, cb),
  },

  llm: {
    listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.llmListModels),
    /** Models of a specific provider, even if it isn't the active one. */
    listModelsFor: (providerId: LLMProviderId): Promise<ModelInfo[]> =>
      ipcRenderer.invoke(IPC.llmListModels, providerId),
    /** Without `providerId` it tests the active one; with it, the one passed. */
    testConnection: (providerId?: LLMProviderId): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.llmTestConnection, providerId),
  },

  app: {
    getInfo: (): Promise<{ version: string; author: string }> => ipcRenderer.invoke(IPC.appGetInfo),
    checkUpdate: (): Promise<UpdateInfo | { error: string }> =>
      ipcRenderer.invoke(IPC.appCheckUpdate),
  },

  /**
   * Skills: local instructions that refine how the model answers.
   *
   * They're only read. The renderer can't write a SKILL.md, and it's not a
   * shortcoming: what's in that folder is put there by the person with their
   * editor, which is what makes it versionable, shareable and reviewable before it
   * ends up inside a prompt.
   */
  skills: {
    list: (): Promise<Skill[]> => ipcRenderer.invoke(IPC.skillsList),
    reload: (): Promise<Skill[]> => ipcRenderer.invoke(IPC.skillsReload),
    openFolder: (): Promise<void> => ipcRenderer.invoke(IPC.skillsOpenFolder),
    folder: (): Promise<string> => ipcRenderer.invoke(IPC.skillsFolder),
  },

  whisper: {
    getStatus: (): Promise<{
      binaryInstalled: boolean;
      modelInstalled: boolean;
      installed: string[];
    }> => ipcRenderer.invoke(IPC.whisperGetStatus),
    install: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(IPC.whisperInstall),
    onProgress: (cb: (p: WhisperProgress) => void) =>
      subscribe<WhisperProgress>(IPC.onWhisperProgress, cb),
  },

  ollama: {
    getStatus: (): Promise<OllamaStatus> => ipcRenderer.invoke(IPC.ollamaGetStatus),
  },

  /** RAM, CPU and GPU: what the local-models guide needs. */
  system: {
    getSpecs: (): Promise<SystemSpecs> => ipcRenderer.invoke(IPC.systemGetSpecs),
    /** Opens an http(s) URL in the system browser. */
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.systemOpenExternal, url),
  },

  /** The complete model guide, generated and opened in the browser. */
  guide: {
    open: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.guideOpen),
  },

  /**
   * Only the `audio-worker` window uses it. It goes here and not in a separate
   * preload so as not to duplicate the bundle; the overlay and the dashboard
   * simply ignore it.
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
