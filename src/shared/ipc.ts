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
  /** main pide al audio-worker que arranque o pare la captura. */
  onCaptureCommand: 'event:capture-command',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Orden que main envía al audio-worker. */
export interface CaptureCommand {
  action: 'start' | 'stop';
  /** Si se debe capturar el micrófono además del loopback. */
  captureMic: boolean;
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
