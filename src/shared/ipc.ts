/**
 * Contrato IPC. Los nombres de canal viven aquí para que main y preload
 * no puedan desincronizarse con un string mal escrito.
 *
 * Convención:
 *   - `invoke`: renderer → main, con respuesta (request/response).
 *   - `send`:   renderer → main, sin respuesta (fire-and-forget, alta frecuencia).
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
  overlayDragStart: 'overlay:drag-start',
  overlayDragEnd: 'overlay:drag-end',
  overlayQuit: 'overlay:quit',
  dashboardOpen: 'dashboard:open',

  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureGetStatus: 'capture:get-status',

  askNow: 'ask:now',
  askAbort: 'ask:abort',
  askWithText: 'ask:with-text',

  screenshotTake: 'screenshot:take',

  llmListModels: 'llm:list-models',
  llmTestConnection: 'llm:test-connection',

  whisperGetStatus: 'whisper:get-status',
  whisperInstall: 'whisper:install',

  ollamaGetStatus: 'ollama:get-status',

  // ── send (renderer → main, sin respuesta) ──
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
  /** main pide al audio-worker que arranque o pare la captura. */
  onCaptureCommand: 'event:capture-command',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Orden que main envía al audio-worker. */
export interface CaptureCommand {
  action: 'start' | 'stop';
  /** Qué fuentes abrir. Ignorado cuando `action` es `stop`. */
  sources: 'both' | 'system' | 'mic';
}

/**
 * Chunk de audio del worker a main.
 * El PCM va como ArrayBuffer (Int16 little-endian) para cruzar el puente
 * con structured clone y sin copiar a base64.
 */
export interface AudioChunkMessage {
  speaker: 'me' | 'them';
  pcm: ArrayBuffer;
  sampleRate: number;
}

/** Progreso de descarga de los assets de Whisper local. */
export interface WhisperProgress {
  target: 'binary' | 'model';
  receivedBytes: number;
  /** `0` si el servidor no envía Content-Length. */
  totalBytes: number;
}
