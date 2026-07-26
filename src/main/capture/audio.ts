import { BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import { IPC, type AudioChunkMessage } from '@shared/ipc';
import type { AudioLevels, CaptureStatus, Speaker } from '@shared/types';
import { createAudioWorker, getAudioWorker } from '../windows/audio-worker';

/**
 * Puente entre la ventana oculta de captura y el resto del proceso main.
 *
 * Responsabilidades:
 *   - Arrancar/parar el worker y mantener el estado de la captura.
 *   - Reenviar los chunks de PCM a quien los consuma (el STT, en la fase 3).
 *   - Difundir estado y niveles a las ventanas visibles.
 *
 * Emite: 'chunk' (speaker, Buffer), 'status' (CaptureStatus), 'levels'.
 */
class AudioCaptureController extends EventEmitter {
  private status: CaptureStatus = {
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  };

  /** Resuelve cuando el worker confirma que su renderer cargó. */
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;

  /**
   * Bytes de PCM recibidos por hablante en la sesión actual. Sirve para
   * distinguir "no se oye nada" de "el pipeline está roto", que desde fuera
   * se ven igual: si el contador crece, el audio llega y el problema está más
   * arriba (nivel de entrada, dispositivo mudo); si no crece, es el pipeline.
   */
  private bytesReceived: Record<Speaker, number> = { me: 0, them: 0 };

  getStatus(): CaptureStatus {
    return { ...this.status };
  }

  private setStatus(patch: Partial<CaptureStatus>): void {
    this.status = { ...this.status, ...patch };
    const snapshot = this.getStatus();
    this.emit('status', snapshot);
    this.broadcast(IPC.onCaptureStatus, snapshot);
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      // El worker no tiene UI: no le mandamos eventos de presentación.
      if (!win.isDestroyed() && win !== getAudioWorker()) {
        win.webContents.send(channel, payload);
      }
    }
  }

  /** Registra los listeners de IPC. Llamar una sola vez al arrancar la app. */
  registerHandlers(): void {
    ipcMain.on(IPC.audioWorkerReady, () => {
      this.resolveReady?.();
      this.resolveReady = null;
    });

    ipcMain.on(IPC.audioChunk, (_e, msg: AudioChunkMessage) => {
      const speaker = msg.speaker as Speaker;
      const previous = this.bytesReceived[speaker];
      this.bytesReceived[speaker] = previous + msg.pcm.byteLength;

      // Una sola línea por hablante y por sesión: confirma que el pipeline
      // entero (worklet → IPC → main) funciona, sin inundar el log.
      if (previous === 0) {
        console.log(`[capture] primer chunk de "${speaker}" (${msg.sampleRate} Hz)`);
      }

      // Los consumidores reciben un Buffer de Node sobre el mismo ArrayBuffer,
      // sin copiar: el hot path del audio pasa por aquí ~10 veces por segundo
      // y por stream.
      this.emit('chunk', speaker, Buffer.from(msg.pcm), msg.sampleRate);
    });

    ipcMain.on(IPC.audioLevels, (_e, levels: AudioLevels) => {
      this.emit('levels', levels);
      this.broadcast(IPC.onAudioLevels, levels);
    });

    ipcMain.on(
      IPC.audioWorkerStarted,
      (_e, info: { micActive: boolean; loopbackActive: boolean }) => {
        this.setStatus({
          state: 'listening',
          micActive: info.micActive,
          loopbackActive: info.loopbackActive,
          error: undefined,
        });
      }
    );

    ipcMain.on(IPC.audioWorkerStopped, () => {
      this.setStatus({ state: 'idle', micActive: false, loopbackActive: false });
    });

    ipcMain.on(IPC.audioWorkerError, (_e, message: string) => {
      console.error('[capture]', message);
      // Un fallo del micrófono no detiene la captura del loopback, así que sólo
      // pasamos a 'error' si no había nada escuchando.
      const fatal = !this.status.loopbackActive;
      this.setStatus({ state: fatal ? 'error' : this.status.state, error: message });
    });
  }

  /**
   * Espera a que el worker esté listo antes de mandarle comandos: si la ventana
   * aún está cargando, un `send` se perdería en silencio.
   */
  private async ensureWorker(): Promise<BrowserWindow> {
    const existing = getAudioWorker();
    if (existing && this.readyPromise) {
      await this.readyPromise;
      return existing;
    }

    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    const worker = createAudioWorker();
    await this.readyPromise;
    return worker;
  }

  async start(captureMic = true): Promise<CaptureStatus> {
    if (this.status.state === 'listening' || this.status.state === 'starting') {
      return this.getStatus();
    }

    this.setStatus({ state: 'starting', error: undefined });
    this.bytesReceived = { me: 0, them: 0 };
    try {
      const worker = await this.ensureWorker();
      worker.webContents.send(IPC.onCaptureCommand, { action: 'start', captureMic });
    } catch (err) {
      this.setStatus({
        state: 'error',
        error: err instanceof Error ? err.message : 'No se pudo iniciar el worker de audio.',
      });
    }
    return this.getStatus();
  }

  stop(): CaptureStatus {
    getAudioWorker()?.webContents.send(IPC.onCaptureCommand, { action: 'stop', captureMic: false });
    this.setStatus({ state: 'idle', micActive: false, loopbackActive: false });
    return this.getStatus();
  }

  /** Alterna escucha; lo usa el hotkey de mute. */
  async toggle(): Promise<CaptureStatus> {
    return this.status.state === 'listening' ? this.stop() : this.start();
  }
}

export const audioCapture = new AudioCaptureController();
