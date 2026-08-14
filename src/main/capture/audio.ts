import { BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import { IPC, type AudioChunkMessage, type CaptureCommand } from '@shared/ipc';
import type { AudioLevels, CaptureStatus, Speaker } from '@shared/types';
import { settingsStore } from '../config/store';
import { m } from '../i18n';
import { createAudioWorker, getAudioWorker } from '../windows/audio-worker';

/**
 * Bridge between the hidden capture window and the rest of the main process.
 *
 * Responsibilities:
 *   - Start/stop the worker and keep the capture state.
 *   - Forward the PCM chunks to whoever consumes them (the STT, in phase 3).
 *   - Broadcast state and levels to the visible windows.
 *
 * Emits: 'chunk' (speaker, Buffer), 'status' (CaptureStatus), 'levels'.
 */
class AudioCaptureController extends EventEmitter {
  private status: CaptureStatus = {
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  };

  /** Resolves when the worker confirms its renderer loaded. */
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;

  /**
   * PCM bytes received per speaker in the current session. It serves to tell
   * "nothing is audible" apart from "the pipeline is broken", which from the
   * outside look the same: if the counter grows, audio arrives and the problem is
   * further up (input level, muted device); if it doesn't grow, it's the pipeline.
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
      // The worker has no UI: we don't send it presentation events.
      if (!win.isDestroyed() && win !== getAudioWorker()) {
        win.webContents.send(channel, payload);
      }
    }
  }

  /** Registers the IPC listeners. Call once when the app starts. */
  registerHandlers(): void {
    ipcMain.on(IPC.audioWorkerReady, () => {
      this.resolveReady?.();
      this.resolveReady = null;
    });

    ipcMain.on(IPC.audioChunk, (_e, msg: AudioChunkMessage) => {
      const speaker = msg.speaker as Speaker;
      const previous = this.bytesReceived[speaker];
      this.bytesReceived[speaker] = previous + msg.pcm.byteLength;

      // A single line per speaker per session: it confirms the whole pipeline
      // (worklet → IPC → main) works, without flooding the log.
      if (previous === 0) {
        console.log(`[capture] primer chunk de "${speaker}" (${msg.sampleRate} Hz)`);
      }

      // The consumers get a Node Buffer over the same ArrayBuffer, without
      // copying: the audio hot path passes through here ~10 times per second per
      // stream.
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
      // A mic failure doesn't stop the loopback capture, so we only go to
      // 'error' if nothing was listening.
      const fatal = !this.status.loopbackActive;
      this.setStatus({ state: fatal ? 'error' : this.status.state, error: message });
    });
  }

  /**
   * Waits for the worker to be ready before sending it commands: if the window
   * is still loading, a `send` would be lost silently.
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

  async start(): Promise<CaptureStatus> {
    if (this.status.state === 'listening' || this.status.state === 'starting') {
      return this.getStatus();
    }

    this.setStatus({ state: 'starting', error: undefined });
    this.bytesReceived = { me: 0, them: 0 };
    try {
      const worker = await this.ensureWorker();
      const command: CaptureCommand = {
        action: 'start',
        sources: settingsStore.get().audioSources,
      };
      worker.webContents.send(IPC.onCaptureCommand, command);
    } catch (err) {
      this.setStatus({
        state: 'error',
        error: err instanceof Error ? err.message : m('err.audioWorker'),
      });
    }
    return this.getStatus();
  }

  stop(): CaptureStatus {
    const command: CaptureCommand = { action: 'stop', sources: 'both' };
    getAudioWorker()?.webContents.send(IPC.onCaptureCommand, command);
    this.setStatus({ state: 'idle', micActive: false, loopbackActive: false });
    return this.getStatus();
  }

  /** Toggles listening; used by the mute hotkey. */
  async toggle(): Promise<CaptureStatus> {
    return this.status.state === 'listening' ? this.stop() : this.start();
  }
}

export const audioCapture = new AudioCaptureController();
