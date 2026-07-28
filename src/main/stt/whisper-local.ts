import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD, type Utterance } from '../core/vad';
import { findWhisperBinary, getModelPath, isModelInstalled } from './whisper-assets';
import { whisperServer } from './whisper-server';
import { toWav } from './wav';
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
];

/**
 * Alucinaciones que son una palabra corriente. Van aparte porque hay que
 * compararlas con el texto ENTERO: whisper devuelve "you" a secas sobre
 * silencio, pero buscarla como subcadena descartaba también cualquier frase que
 * la contuviera ("what about your team", "youtube").
 */
const HALLUCINATION_EXACT = ['you', 'gracias', 'thank you', 'thanks', '¡gracias!'];

function isLikelyHallucination(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (normalized.length < 4) return true;

  const bare = normalized.replace(/[.!?¡¿]/g, '').trim();
  if (HALLUCINATION_EXACT.includes(bare)) return true;

  return HALLUCINATIONS.some((phrase) => normalized.includes(phrase));
}

/** Carril por hablante: su propio VAD y su propia cola de transcripción. */
class Lane {
  private readonly vad: EnergyVAD;
  /**
   * Cola en serie. Dos invocaciones de whisper.cpp a la vez se pelean por la
   * CPU y ambas tardan más que ejecutadas en orden.
   */
  private queue: Promise<void> = Promise.resolve();
  /**
   * Turnos esperando a whisper. Si esto crece y no baja, la transcripción va
   * más lenta que el habla y la latencia se acumula sin techo — otra forma de
   * "deja de responder" que desde fuera es indistinguible de un cuelgue.
   */
  private pending = 0;

  constructor(
    private readonly speaker: Speaker,
    private readonly transcribe: (utterance: Utterance) => Promise<string>,
    private readonly emitter: EventEmitter,
    sampleRate: number
  ) {
    this.vad = new EnergyVAD({ sampleRate, silenceMs: 700, maxUtteranceMs: 20_000 });
  }

  push(pcm: Int16Array): void {
    for (const utterance of this.vad.push(pcm)) {
      /*
       * `forced` significa que el turno se cortó por llegar al máximo, no
       * porque la persona dejara de hablar. Uno suelto es normal (alguien que
       * se enrolla); varios seguidos son la firma del VAD enganchado en ruido,
       * y hasta ahora ese dato existía en el tipo `Utterance` y no lo leía
       * nadie. Es exactamente lo que hay que ver en el log cuando "deja de
       * responder".
       */
      if (utterance.forced) {
        console.warn(
          `[vad:${this.speaker}] corte FORZADO a ${Math.round(utterance.durationMs / 1000)}s ` +
            `(suelo de ruido ${this.vad.currentNoiseFloor.toFixed(4)}). ` +
            'Si se repite, el detector está tomando ruido por voz.'
        );
      } else {
        console.log(
          `[vad:${this.speaker}] turno de ${Math.round(utterance.durationMs)}ms → a transcribir ` +
            `(${this.pending} en cola)`
        );
      }
      this.enqueue(utterance);
    }
  }

  flush(): void {
    const remaining = this.vad.flush();
    if (remaining) this.enqueue(remaining);
  }

  private enqueue(utterance: Utterance): void {
    this.pending += 1;
    this.queue = this.queue.then(async () => {
      const startedAt = Date.now();
      try {
        const text = await this.transcribe(utterance);
        const tookMs = Date.now() - startedAt;
        // Más lento que tiempo real significa que la cola sólo puede crecer.
        if (tookMs > utterance.durationMs) {
          console.warn(
            `[whisper:${this.speaker}] ${tookMs}ms para transcribir ${Math.round(utterance.durationMs)}ms ` +
              'de audio: más lento que tiempo real. Prueba un modelo más pequeño.'
          );
        }

        if (!text) {
          console.log(`[whisper:${this.speaker}] sin texto (${tookMs}ms)`);
        } else if (isLikelyHallucination(text)) {
          console.log(`[whisper:${this.speaker}] descartado por alucinación: "${text}"`);
        } else {
          console.log(`[whisper:${this.speaker}] "${text}" (${tookMs}ms)`);
          this.emitter.emit('segment', { speaker: this.speaker, text, isFinal: true });
        }
      } catch (err) {
        this.emitter.emit(
          'error',
          new Error(
            `[whisper:${this.speaker}] ${err instanceof Error ? err.message : String(err)}`
          )
        );
      } finally {
        this.pending -= 1;
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
  /** `false` cae al CLI, que arranca un proceso por intervención. */
  private useServer = false;

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

    // El servidor ahorra ~570 ms por turno frente a lanzar el CLI cada vez. Si
    // no arranca se sigue con el CLI: más lento, pero la transcripción funciona.
    this.useServer = await whisperServer.ensure(this.modelPath, options.language);
    console.log(
      `[whisper] transcribiendo con ${this.useServer ? 'whisper-server (modelo residente)' : 'whisper-cli (un proceso por turno)'}`
    );

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

  /** Transcribe un turno: por el servidor si está vivo, si no por el CLI. */
  private async runWhisper(utterance: Utterance, options: STTStartOptions): Promise<string> {
    if (!this.tempDir) return '';

    const wav = toWav(utterance.pcm, options.sampleRate);

    if (this.useServer && whisperServer.running) {
      try {
        return cleanOutput(await whisperServer.transcribe(wav, options.language));
      } catch (err) {
        // El servidor puede haberse caído entre turnos. Se degrada al CLI en
        // lugar de perder la intervención, y se deja de intentarlo.
        console.warn(
          `[whisper-server] falló (${err instanceof Error ? err.message : String(err)}); ` +
            'se continúa con whisper-cli.'
        );
        this.useServer = false;
      }
    }

    const wavPath = join(this.tempDir, `u${this.counter++}.wav`);
    writeFileSync(wavPath, wav);

    const args = [
      '-m', this.modelPath,
      '-f', wavPath,
      // Sin timestamps ni marcas: sólo queremos el texto.
      '--no-timestamps',
      '--no-prints',
      // Ojo: `--output-txt` es un flag booleano SIN argumento. Pasarle "false"
      // hacía que whisper-cli lo tomara por un fichero de entrada
      // ("error: input file not found 'false'") y encima escribía un .txt al
      // lado del WAV. Lo que queremos es no pasarlo en absoluto.
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
 * Ejecuta whisper-cli sobre un WAV sintético para probar la instalación entera.
 *
 * Se ejecuta el binario de verdad, con el modelo de verdad, porque los dos
 * fallos que se han dado aquí eran invisibles de otra forma: el stub `main.exe`
 * (existe, pesa lo mismo que un ejecutable, y sale con código 1) y las DLL de
 * ggml, que sólo revientan al cargar el modelo. Un `existsSync` no habría
 * detectado ninguno de los dos.
 */
export async function testWhisperBinary(
  modelId: string
): Promise<{ ok: boolean; detail: string }> {
  const binary = findWhisperBinary();
  if (!binary) {
    return { ok: false, detail: 'No se encuentra whisper-cli.exe. Descárgalo desde arriba.' };
  }
  if (!isModelInstalled(modelId)) {
    return { ok: false, detail: `El modelo "${modelId}" no está descargado.` };
  }

  const dir = mkdtempSync(join(tmpdir(), 'ih-whisper-test-'));
  const wavPath = join(dir, 'probe.wav');
  // Medio segundo de tono bajo: suficiente para que cargue el modelo y corra la
  // inferencia. No importa qué transcriba, sólo que llegue al final.
  const samples = new Int16Array(8_000);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.round(1_500 * Math.sin((2 * Math.PI * 220 * i) / 16_000));
  }
  writeFileSync(wavPath, toWav(samples, 16_000));

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        binary,
        ['-m', getModelPath(modelId), '-f', wavPath, '--no-timestamps', '--no-prints', '-t', '2'],
        { timeout: 90_000, maxBuffer: 1024 * 1024 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    return { ok: true, detail: `Whisper funciona. Ejecutable: ${binary}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `Falló al ejecutar ${binary}\n${message}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
