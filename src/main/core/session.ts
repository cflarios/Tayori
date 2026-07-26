import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { Answer, AnswerTrigger, ImageAttachment, Speaker, TranscriptSegment } from '@shared/types';
import { settingsStore } from '../config/store';
import { audioCapture } from '../capture/audio';
import { createSTTProvider, type STTProvider, type TranscriptEvent } from '../stt';
import { TranscriptBuffer } from './transcript-buffer';
import { AnswerEngine } from './answer-engine';
import { getAudioWorker } from '../windows/audio-worker';

/**
 * Une captura de audio, transcripción y (desde la fase 4) generación de
 * respuestas.
 *
 * Es el único sitio que conoce a la vez el pipeline de audio y el motor de STT;
 * ni el controlador de captura ni los providers se conocen entre sí.
 */
class SessionOrchestrator {
  private stt: STTProvider | null = null;
  readonly transcript = new TranscriptBuffer(settingsStore.get().transcriptWindowSize);
  readonly answers = new AnswerEngine(this.transcript);

  /**
   * Temporizador por hablante para cerrar segmentos que el motor dejó abiertos.
   * Gemini no siempre marca `finished` cuando alguien simplemente se calla, y
   * un segmento eternamente abierto impediría detectar el fin de la pregunta.
   */
  private silenceTimers = new Map<Speaker, NodeJS.Timeout>();
  private static readonly SILENCE_MS = 900;

  /** Conecta el flujo de audio al STT. Llamar una vez al arrancar la app. */
  bind(): void {
    audioCapture.on('chunk', (speaker: Speaker, pcm: Buffer) => {
      this.stt?.push(speaker, pcm);
    });

    audioCapture.on('status', (status: { state: string }) => {
      if (status.state === 'listening') void this.startTranscription();
      if (status.state === 'idle' || status.state === 'error') void this.stopTranscription();
    });

    this.answers.on('answer', (answer: Answer) => {
      this.broadcast(IPC.onAnswer, answer);
    });
  }

  // ── API que consumen los hotkeys y el IPC ──

  /** Responde usando la última pregunta cerrada del interlocutor si la hay. */
  ask(trigger: AnswerTrigger): Promise<void> {
    const lastQuestion = this.transcript.lastFrom('them');
    return this.answers.ask(trigger, lastQuestion?.text.trim() || undefined);
  }

  /** Responde a un texto escrito a mano en el overlay. */
  askWithText(text: string): Promise<void> {
    return this.answers.ask('manual-input', text);
  }

  abortAnswer(): void {
    this.answers.abort();
  }

  attachImage(image: ImageAttachment): void {
    this.answers.attachImage(image);
  }

  private async startTranscription(): Promise<void> {
    if (this.stt) return;

    const settings = settingsStore.get();
    try {
      const provider = createSTTProvider(settings);

      provider.events.on('segment', (event: TranscriptEvent) => this.onSegment(event));
      provider.events.on('error', (err: Error) => {
        console.error('[stt]', err.message);
        // Un error de STT no detiene la captura: el audio sigue llegando y la
        // reconexión puede recuperar la sesión.
      });

      await provider.start({
        sampleRate: 16_000,
        language: settings.language,
        vocabulary: collectVocabulary(settings.contextPacks),
      });

      this.stt = provider;
      console.log(`[stt] transcripción iniciada con "${provider.id}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[stt] no se pudo iniciar:', message);
      this.broadcast(IPC.onCaptureStatus, {
        ...audioCapture.getStatus(),
        state: 'error',
        error: message,
      });
    }
  }

  private async stopTranscription(): Promise<void> {
    for (const timer of this.silenceTimers.values()) clearTimeout(timer);
    this.silenceTimers.clear();

    const provider = this.stt;
    this.stt = null;
    await provider?.stop();
  }

  private onSegment(event: TranscriptEvent): void {
    const segment = this.transcript.ingest(event.speaker, event.text, event.isFinal);
    this.broadcast(IPC.onTranscript, segment);

    if (event.isFinal) {
      this.clearSilenceTimer(event.speaker);
      this.onFinalSegment(segment);
    } else {
      this.armSilenceTimer(event.speaker);
    }
  }

  /**
   * Punto de enganche del auto-disparo (fase 7). Se deja aquí para que el flujo
   * quede completo desde ahora y la fase 7 sólo añada el detector.
   */
  private onFinalSegment(segment: TranscriptSegment): void {
    void segment;
  }

  private armSilenceTimer(speaker: Speaker): void {
    this.clearSilenceTimer(speaker);
    this.silenceTimers.set(
      speaker,
      setTimeout(() => {
        this.silenceTimers.delete(speaker);
        const closed = this.transcript.finalizeOpen(speaker);
        if (closed) {
          this.broadcast(IPC.onTranscript, closed);
          this.onFinalSegment(closed);
        }
      }, SessionOrchestrator.SILENCE_MS)
    );
  }

  private clearSilenceTimer(speaker: Speaker): void {
    const timer = this.silenceTimers.get(speaker);
    if (timer) {
      clearTimeout(timer);
      this.silenceTimers.delete(speaker);
    }
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win !== getAudioWorker()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}

/**
 * Extrae términos de los context packs para sesgar el reconocedor.
 *
 * Un CV y una descripción de puesto están llenos de nombres propios, siglas y
 * tecnologías: justo lo que un ASR generalista transcribe mal. Nos quedamos con
 * los tokens capitalizados o en mayúsculas, que es donde están esos términos.
 */
function collectVocabulary(packs: { content: string; enabled: boolean }[]): string[] {
  const terms = new Set<string>();

  for (const pack of packs) {
    if (!pack.enabled) continue;
    const matches = pack.content.match(/\b[A-Z][A-Za-z0-9+#.]{1,20}\b/g) ?? [];
    for (const term of matches) {
      if (term.length > 1) terms.add(term);
    }
  }

  // La API acota el vocabulario personalizado; mandar cientos de términos lo
  // empeora en lugar de mejorarlo, así que nos quedamos con los primeros.
  return [...terms].slice(0, 100);
}

export const session = new SessionOrchestrator();
