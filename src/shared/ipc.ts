/**
 * IPC contract. The channel names live here so main and preload can't desync
 * with a mistyped string.
 *
 * Convention:
 *   - `invoke`: renderer → main, with a response (request/response).
 *   - `send`:   renderer → main, no response (fire-and-forget, high frequency).
 *   - `event`:  main → renderer (broadcast).
 */

export const IPC = {
  // ── invoke ──
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  secretsGetPresence: 'secrets:get-presence',
  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',

  stealthSet: 'stealth:set',
  clickThroughSet: 'click-through:set',
  overlayHide: 'overlay:hide',
  overlayResize: 'overlay:resize',
  overlayMouseIgnore: 'overlay:mouse-ignore',
  /** Makes the overlay focusable so you can write in it. See `overlay.ts`. */
  overlayInteractive: 'overlay:interactive',
  overlayDragStart: 'overlay:drag-start',
  overlayDragEnd: 'overlay:drag-end',
  overlayQuit: 'overlay:quit',
  dashboardOpen: 'dashboard:open',
  /**
   * Controls for the dashboard's own title bar.
   *
   * The window is `frame: false` so it can paint a macOS-style bar —the three
   * traffic lights on the left—, so minimize, maximize and close no longer have
   * system buttons and are requested through here. They act on the emitting
   * window (`fromWebContents`), not a global one. Close closes ONLY the
   * dashboard: the overlay is the app and stays alive, just as the native X did.
   */
  dashboardMinimize: 'dashboard:minimize',
  dashboardToggleMaximize: 'dashboard:toggle-maximize',
  dashboardClose: 'dashboard:close',

  /**
   * Extracts text from a context file (PDF, Word) in the main process.
   *
   * The renderer sends the bytes and receives the already-plain text. It goes to
   * the main process because parsing a PDF or a .docx is heavy work with
   * libraries, and the project concentrates that in the Node process. Plain text
   * (.txt/.md) doesn't go through here: the renderer reads it with FileReader.
   */
  contextParseFile: 'context:parse-file',

  /**
   * Chunk capture: solve the accumulated stack or clear it. They're triggered by
   * the shortcuts (from the main process) and by the overlay chip's buttons (over
   * IPC).
   */
  scrollCaptureSolve: 'scroll-capture:solve',
  scrollCaptureClear: 'scroll-capture:clear',

  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureGetStatus: 'capture:get-status',

  askNow: 'ask:now',
  askAbort: 'ask:abort',
  askWithText: 'ask:with-text',
  /** Captures the screen and solves whatever is on it: code or quiz. */
  askSolveScreen: 'ask:solve-screen',
  /** Clears the conversation's memory without touching anything else. */
  askForgetContext: 'ask:forget-context',
  /** Extends the last code answer by appending to the same answer. */
  askContinue: 'ask:continue',
  /** How many exchanges the model has in its head. */
  memoryGet: 'memory:get',

  screenshotTake: 'screenshot:take',

  /**
   * Copy text to the clipboard, from the main process.
   *
   * `navigator.clipboard` is no good in the overlay, and not by an oversight: it
   * requires the document to have the focus, and the overlay is `focusable: false`
   * on purpose so as not to steal it from the video call. Besides,
   * `setPermissionRequestHandler` only grants `clipboard-read`, so writing
   * wouldn't pass the filter either. Electron's `clipboard` module has neither of
   * the two restrictions.
   */
  clipboardWrite: 'clipboard:write',

  conversationNew: 'conversation:new',
  historyList: 'history:list',
  historyGet: 'history:get',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',
  historyLocation: 'history:location',

  llmListModels: 'llm:list-models',
  llmTestConnection: 'llm:test-connection',

  /** Version and authorship, for the «About» section. */
  appGetInfo: 'app:get-info',
  /** Asks GitHub whether there's a newer version. On demand. */
  appCheckUpdate: 'app:check-update',

  /**
   * The skills currently on disk.
   *
   * Both renderers request it and for different reasons: the dashboard to list
   * them, and the overlay to autocomplete `/name` and for its selector. An
   * `invoke` and not an event because the disk doesn't change on its own — it
   * changes when someone edits a folder, and that's what `skillsReload` is for.
   */
  skillsList: 'skills:list',
  /** Re-reads the folder. It's what makes editing a SKILL.md noticed without restarting. */
  skillsReload: 'skills:reload',
  /** Creates the folder if needed and opens it in the explorer. */
  skillsOpenFolder: 'skills:open-folder',
  /** Where the folder lives, to be able to show the path like the history does. */
  skillsFolder: 'skills:folder',

  whisperGetStatus: 'whisper:get-status',
  whisperInstall: 'whisper:install',

  /** Actually connects to the transcription engine and says what failed. */
  sttTestConnection: 'stt:test-connection',

  /** Accelerators Windows rejected, usually for being already in use. */
  hotkeysGetFailed: 'hotkeys:get-failed',

  logsRead: 'logs:read',
  logsLocation: 'logs:location',

  ollamaGetStatus: 'ollama:get-status',

  /** The machine's RAM, CPU and GPU, to recommend a local model. */
  systemGetSpecs: 'system:get-specs',
  /** Opens an http(s) URL in the system browser, never inside the app. */
  systemOpenExternal: 'system:open-external',

  /**
   * Generates the model guide and opens it in the browser.
   *
   * It goes to a document and not to an app window because of the project's golden
   * rule: every new Electron window is one more window to register in the capture
   * protection, and invisible mode is verified, not assumed. An HTML is also
   * saved, printed and read with the app closed.
   */
  guideOpen: 'guide:open',

  /** The mirror's link, QR and connected phones. See `main/bridge/phone.ts`. */
  phoneGetStatus: 'phone:get-status',

  /**
   * The setup wizard puts Ollama and a model on the machine.
   *
   * They go over IPC and not through a loose script because permission has to be
   * **asked for**: one installs software with winget and the other downloads
   * several gigs. Both warn of what they're going to do before doing it, and both
   * report via `onSetupProgress`, which is what keeps a three-minute download from
   * being experienced as a hung app.
   */
  /** State of the connection with the MQTT broker. See `main/bridge/mqtt.ts`. */
  mqttGetStatus: 'mqtt:get-status',
  /** Publishes a test answer to check the setup in one go. */
  mqttTest: 'mqtt:test',

  setupCanInstall: 'setup:can-install',
  /**
   * Whether Ollama is installed, running or not.
   *
   * Distinct from `ollamaGetStatus`, which asks about the **server**. Confusing
   * the two made the wizard offer to install Ollama to someone who already had it
   * and only had it stopped.
   */
  setupOllamaInstalled: 'setup:ollama-installed',
  setupInstallOllama: 'setup:install-ollama',
  setupPullModel: 'setup:pull-model',

  // ── send (renderer → main, no response) ──
  audioChunk: 'audio:chunk',
  audioLevels: 'audio:levels',
  audioWorkerReady: 'audio:worker-ready',
  audioWorkerStarted: 'audio:worker-started',
  audioWorkerStopped: 'audio:worker-stopped',
  audioWorkerError: 'audio:worker-error',

  // ── event (main → renderer) ──
  onTranscript: 'event:transcript',
  onAnswer: 'event:answer',
  onCaptureStatus: 'event:capture-status',
  onSettings: 'event:settings',
  onAudioLevels: 'event:audio-levels',
  onScreenshot: 'event:screenshot',
  onWhisperProgress: 'event:whisper-progress',
  /** A new conversation was started: the renderers must clear their state. */
  onConversationReset: 'event:conversation-reset',
  /**
   * The overlay must re-sync its mouse tracking.
   *
   * `useChromeMouse` caches locally whether it's ignoring the mouse and only
   * notifies the main process on changes. When another window (the dashboard)
   * steals the focus and closes, the `mousemove` forwarding is interrupted and the
   * cache is left desynced from the real state; without this notice the overlay is
   * left unclickable.
   */
  onOverlayResync: 'event:overlay-resync',
  /** Transcription engine failure. The capture is still alive; it must be shown. */
  onSTTError: 'event:stt-error',
  /**
   * The detector decided not to answer an utterance.
   *
   * Without this the skip is invisible: the transcription appears and nothing else
   * happens, which from the outside is indistinguishable from a broken app. It
   * really happened — someone tried five times with "¿me escuchas?" and concluded
   * that no model was answering, when each skip had been correct.
   */
  onAutoSkip: 'event:auto-skip',
  /**
   * Something failed outside the audio and it must be shown as-is.
   *
   * It exists because the only channel to "warn of a failure" was `onSTTError`,
   * and the overlay paints it with the "Transcription:" prefix. Sending a
   * screen-capture failure through there would have produced a message blaming the
   * wrong engine, which is worse than not warning: it sends you to debug where it
   * isn't.
   */
  onNotice: 'event:notice',
  /**
   * Move the teleprompter line.
   *
   * It goes by event and not by an `invoke` from the overlay because what triggers
   * it is a GLOBAL shortcut: the overlay doesn't have the focus —it's
   * `focusable: false`— so it can't hear a key on its own. The main process
   * receives it and forwards it.
   */
  onTeleprompterMove: 'event:teleprompter-move',
  /**
   * The result of registering the shortcuts changed.
   *
   * `registerHotkeys` already returned the rejected ones and nobody picked up the
   * list: it only came out in the log, which nobody looks at in the packaged
   * `.exe`. A shortcut that another application has taken doesn't fail when
   * pressed — nothing simply happens, which is indistinguishable from the app
   * being broken.
   */
  onHotkeyFailures: 'event:hotkey-failures',
  /**
   * The conversation's memory changed.
   *
   * It's broadcast because it's the only part of each query's cost the user can
   * control: each remembered turn is resent whole in the next question, and with
   * Ollama that runs into `num_ctx` without giving any error.
   */
  onMemory: 'event:memory',
  /**
   * Something about the phone mirror changed: it started, stopped, or a phone came
   * in or went out.
   *
   * The last one is what justifies it being an event and not just an `invoke`: the
   * user's real question is "am I seeing it on my phone?", and the only honest
   * answer is a counter that moves by itself when the phone actually connects.
   */
  onPhoneStatus: 'event:phone-status',

  /** Progress of the Ollama install or of a model download. */
  onSetupProgress: 'event:setup-progress',

  /** The connection with the broker changed, or something was published. */
  onMqttStatus: 'event:mqtt-status',

  /**
   * An API key was saved or deleted.
   *
   * It exists because the overlay decides with this whether to show «The AI needs
   * configuring», and without the event that warning was only computed on startup:
   * you pasted the missing key in the dashboard and the panel kept saying it was
   * missing. The **presence** travels, never the key.
   */
  onSecrets: 'event:secrets',

  /** The main process asks the audio-worker to start or stop the capture. */
  onCaptureCommand: 'event:capture-command',

  /**
   * The chunk-capture state changed: how many frames are on the stack and whether
   * the automatic loop is recording. The overlay chip paints it.
   */
  onScrollCapture: 'event:scroll-capture',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Command the main process sends to the audio-worker. */
export interface CaptureCommand {
  action: 'start' | 'stop';
  /** Which sources to open. Ignored when `action` is `stop`. */
  sources: 'both' | 'system' | 'mic';
}

/**
 * Audio chunk from the worker to the main process.
 * The PCM goes as an ArrayBuffer (Int16 little-endian) to cross the bridge with
 * structured clone and without copying to base64.
 */
export interface AudioChunkMessage {
  speaker: 'me' | 'them';
  pcm: ArrayBuffer;
  sampleRate: number;
}

/** Chunk-capture state, for the overlay chip. */
export interface ScrollCaptureState {
  /** Frames accumulated on the stack. */
  frames: number;
  /** The automatic loop is capturing right now. */
  capturing: boolean;
  mode: 'manual' | 'auto';
}

/** Download progress of the local Whisper assets. */
export interface WhisperProgress {
  target: 'binary' | 'model';
  receivedBytes: number;
  /** `0` if the server doesn't send Content-Length. */
  totalBytes: number;
}
