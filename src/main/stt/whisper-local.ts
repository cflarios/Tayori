import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD, type Utterance } from '../core/vad';
import { findWhisperBinary, getModelPath, isModelInstalled } from './whisper-assets';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Transcripción local con el binario de whisper.cpp.
 *
 * Whisper no hace streaming, así que el flujo es: VAD por hablante → turno
 * cerrado → WAV temporal → whisper-cli → texto. La latencia real es la del
 * silencio de cierre (~700 ms) más la inferencia (0,3–2 s según modelo y CPU),
 * frente a los ~300 ms de Gemini Live. Es el precio de no depender de la red.
 *
 * Sólo emite segmentos FINALES: no hay parciales que revisar porque cada turno
 * se transcribe de una vez.
 */

/**
 * Transcripciones que whisper.cpp produce sobre silencio o ruido. Son
 * alucinaciones conocidas del modelo con los subtítulos de su corpus de
 * entrenamiento, y colarlas en el transcript envenenaría el contexto del LLM.
 */
const HALLUCINATIONS = [
  'subtítulos realizados por',
  'subtitulado por',
  'subtitles by',
  'thanks for watching',
  'gracias por ver',
  'amara.org',
  'www.',
  '[música]',
  '[music]',
  '(música)',
  '[silencio]',
  '[blank_audio]',
  '[sonido]',
  'you',
];

function isLikelyHallucination(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (normalized.length < 4) return true;
  return HALLUCINATIONS.some((phrase) => normalized.includes(phrase));
}

/** Envuelve PCM16 mono en una cabecera WAV; whisper-cli lee archivos, no stdin. */
function toWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataBytes = pcm.length * 2;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // tamaño del bloque fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits por muestra
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);

  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, dataBytes)]);
}

/** Carril por hablante: su propio VAD y su propia cola de transcripción. */
class Lane {
  private readonly vad: EnergyVAD;
  /**
   * Cola en serie. Dos invocaciones de whisper.cpp a la vez se pelean por la
   * CPU y ambas tardan más que ejecutadas en orden.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly speaker: Speaker,
    private readonly transcribe: (utterance: Utterance) => Promise<string>,
    private readonly emitter: EventEmitter,
    sampleRate: number
  ) {
    this.vad = new EnergyVAD({ sampleRate, silenceMs: 700, maxUtteranceMs: 20_000 });
  }

  push(pcm: Int16Array): void {
    for (const utterance of this.vad.push(pcm)) this.enqueue(utterance);
  }

  flush(): void {
    const remaining = this.vad.flush();
    if (remaining) this.enqueue(remaining);
  }

  private enqueue(utterance: Utterance): void {
    this.queue = this.queue.then(async () => {
      try {
        const text = await this.transcribe(utterance);
        if (text && !isLikelyHallucination(text)) {
          this.emitter.emit('segment', { speaker: this.speaker, text, isFinal: true });
        }
      } catch (err) {
        this.emitter.emit(
          'error',
          new Error(
            `[whisper:${this.speaker}] ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  reset(): void {
    this.vad.reset();
  }
}

export class WhisperLocalSTT implements STTProvider {
  readonly id: STTProviderId = 'whisper-local';
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();
  private tempDir: string | null = null;
  private counter = 0;
  private stopped = false;

  constructor(
    private readonly binaryPath: string,
    private readonly modelPath: string
  ) {}

  /**
   * Construye el provider comprobando que los assets están instalados. El
   * mensaje de error apunta al dashboard porque es donde se descargan.
   */
  static create(modelId: string): WhisperLocalSTT {
    const binary = findWhisperBinary();
    if (!binary) {
      throw new Error(
        'El ejecutable de Whisper no está instalado. Descárgalo desde el dashboard (7,6 MB).'
      );
    }
    if (!isModelInstalled(modelId)) {
      throw new Error(
        `El modelo de Whisper "${modelId}" no está descargado. Hazlo desde el dashboard.`
      );
    }
    return new WhisperLocalSTT(binary, getModelPath(modelId));
  }

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.tempDir = mkdtempSync(join(tmpdir(), 'ih-whisper-'));

    for (const speaker of options.speakers) {
      this.lanes.set(
        speaker,
        new Lane(
          speaker,
          (utterance) => this.runWhisper(utterance, options),
          this.events,
          options.sampleRate
        )
      );
    }
  }

  push(speaker: Speaker, pcm: Buffer): void {
    if (this.stopped) return;
    // El Buffer viene del IPC; se reinterpreta como Int16 sin copiar.
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    this.lanes.get(speaker)?.push(samples);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const lane of this.lanes.values()) {
      lane.flush();
      lane.reset();
    }
    this.lanes.clear();

    if (this.tempDir) {
      rmSync(this.tempDir, { recursive: true, force: true });
      this.tempDir = null;
    }
    return Promise.resolve();
  }

  /** Ejecuta whisper-cli sobre un WAV temporal y devuelve el texto plano. */
  private async runWhisper(utterance: Utterance, options: STTStartOptions): Promise<string> {
    if (!this.tempDir) return '';

    const wavPath = join(this.tempDir, `u${this.counter++}.wav`);
    writeFileSync(wavPath, toWav(utterance.pcm, options.sampleRate));

    const args = [
      '-m', this.modelPath,
      '-f', wavPath,
      // Sin timestamps ni marcas: sólo queremos el texto.
      '--no-timestamps',
      '--no-prints',
      '--output-txt', 'false',
      // Hilos: dejamos un núcleo libre para no ahogar la captura de audio.
      '-t', String(Math.max(2, (cpus().length || 4) - 1)),
    ];

    if (options.language && options.language !== 'auto') {
      args.push('-l', options.language.split('-')[0] ?? options.language);
    } else {
      args.push('-l', 'auto');
    }

    try {
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        execFile(
          this.binaryPath,
          args,
          { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
          (err, stdout) => (err ? reject(err) : resolve({ stdout }))
        );
      });
      return cleanOutput(stdout);
    } finally {
      rmSync(wavPath, { force: true });
    }
  }
}

/**
 * Limpia la salida de whisper-cli.
 *
 * Aun con `--no-timestamps` deja líneas de diagnóstico y a veces marcas de
 * tiempo residuales, así que se filtran en lugar de confiar en las banderas.
 */
function cleanOutput(stdout: string): string {
  return stdout
    .split('\n')
    .map((line) => line.replace(/^\[[\d:.\s\->]+\]\s*/, '').trim())
    .filter((line) => line && !line.startsWith('whisper_') && !line.startsWith('['))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
