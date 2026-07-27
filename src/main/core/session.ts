import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import {
  autoTriggerIsInert,
  speakersFor,
  type Answer,
  type AnswerTrigger,
  type ImageAttachment,
  type Speaker,
  type TranscriptSegment,
} from '@shared/types';
import { settingsStore } from '../config/store';
import { audioCapture } from '../capture/audio';
import { createSTTProvider, type STTProvider, type TranscriptEvent } from '../stt';
import { TranscriptBuffer } from './transcript-buffer';
import { AnswerEngine } from './answer-engine';
import { looksLikeQuestion } from './question-detector';
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

  /** Momento del último auto-disparo, para el debounce. */
  private lastAutoTrigger = 0;
  private static readonly AUTO_DEBOUNCE_MS = 2_500;

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

  /** Responde usando la última intervención cerrada relevante, si la hay. */
  ask(trigger: AnswerTrigger): Promise<void> {
    const lastQuestion = this.lastRelevantSegment();
    return this.answers.ask(trigger, lastQuestion?.text.trim() || undefined);
  }

  /**
   * Qué intervención se toma como "la pregunta" con el hotkey manual.
   *
   * Se prefiere el hablante configurado para el auto-disparo. Sólo se cae a
   * otro si ése **ni siquiera se está escuchando** (disparo en `them` con
   * `audioSources: 'mic'`, por ejemplo): ahí `lastFrom` devolvería siempre null
   * y el hotkey mandaría la pregunta vacía. Si sí se escucha pero todavía no ha
   * dicho nada, no hay fallback: mandar la última línea de otro como si fuera la
   * pregunta es peor que dejar que el modelo la deduzca del transcript.
   */
  private lastRelevantSegment(): TranscriptSegment | null {
    const settings = settingsStore.get();
    const wanted = settings.autoTriggerSpeaker;
    const heard = speakersFor(settings.audioSources);
    const order: Speaker[] = wanted !== 'any' && heard.includes(wanted) ? [wanted] : ['them', 'me'];

    for (const speaker of order) {
      const segment = this.transcript.lastFrom(speaker);
      if (segment) return segment;
    }
    return null;
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
        speakers: speakersFor(settings.audioSources),
        vocabulary: collectVocabulary(settings.contextPacks),
      });

      this.stt = provider;
      console.log(`[stt] transcripción iniciada con "${provider.id}"`);

      // Aviso explícito de una combinación que no da ningún síntoma: el audio
      // llega, se transcribe, y el auto-disparo descarta todos los segmentos
      // porque el hablante que debería dispararlo ni siquiera se escucha. Sin
      // esta línea, desde fuera se ve igual que "el modelo no responde".
      if (autoTriggerIsInert(settings)) {
        console.warn(
          `[auto] inerte: se dispara con "${settings.autoTriggerSpeaker}" pero ` +
            `audioSources="${settings.audioSources}" solo escucha ` +
            `[${speakersFor(settings.audioSources).join(', ')}]. ` +
            'No saltará ninguna respuesta automática; usa el hotkey manual o ' +
            'cambia los ajustes en el dashboard.'
        );
      }
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
   * Auto-disparo. Sólo se evalúan intervenciones cerradas del hablante elegido;
   * el default es el interlocutor porque responder a lo que dice el propio
   * usuario no tiene sentido en una entrevista.
   */
  private onFinalSegment(segment: TranscriptSegment): void {
    const settings = settingsStore.get();
    if (settings.autoTriggerMode === 'off') return;

    const wanted = settings.autoTriggerSpeaker;
    if (wanted !== 'any' && segment.speaker !== wanted) return;

    const verdict = looksLikeQuestion(segment.text);
    if (!verdict.isQuestion) return;

    // Debounce: una pregunta larga puede cerrarse en varios segmentos seguidos.
    // Sin esto se dispararían dos o tres respuestas para la misma pregunta, y
    // cada una abortaría la anterior a media generación.
    const now = Date.now();
    if (now - this.lastAutoTrigger < SessionOrchestrator.AUTO_DEBOUNCE_MS) return;
    this.lastAutoTrigger = now;

    console.log(`[auto] disparando (${verdict.reason}): "${segment.text.slice(0, 60)}"`);
    void this.answers.ask('auto', segment.text.trim());
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
