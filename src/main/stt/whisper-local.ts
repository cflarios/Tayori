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
import { m } from '../i18n';

/**
 * Local transcription with the whisper.cpp binary.
 *
 * Whisper doesn't stream, so the flow is: per-speaker VAD → closed turn →
 * temporary WAV → whisper-cli → text. The real latency is the closing silence
 * (~700 ms) plus the inference (0.3–2 s depending on model and CPU), against
 * Gemini Live's ~300 ms. It's the price of not depending on the network.
 *
 * It only emits FINAL segments: there are no partials to revise because each
 * turn is transcribed at once.
 */

/**
 * Transcriptions whisper.cpp produces over silence or noise. They're known model
 * hallucinations from the subtitles in its training corpus, and slipping them
 * into the transcript would poison the LLM's context.
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
 * Hallucinations that are ordinary words. They go apart because they have to be
 * compared against the WHOLE text: whisper returns a bare "you" over silence,
 * but searching for it as a substring also discarded any sentence that contained
 * it ("what about your team", "youtube").
 */
const HALLUCINATION_EXACT = ['you', 'gracias', 'thank you', 'thanks', '¡gracias!'];

function isLikelyHallucination(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (normalized.length < 4) return true;

  const bare = normalized.replace(/[.!?¡¿]/g, '').trim();
  if (HALLUCINATION_EXACT.includes(bare)) return true;

  return HALLUCINATIONS.some((phrase) => normalized.includes(phrase));
}

/** Per-speaker lane: its own VAD and its own transcription queue. */
class Lane {
  private readonly vad: EnergyVAD;
  /**
   * Serial queue. Two whisper.cpp invocations at once fight over the CPU and
   * both take longer than run in order.
   */
  private queue: Promise<void> = Promise.resolve();
  /**
   * Turns waiting on whisper. If this grows and doesn't drop, transcription runs
   * slower than speech and latency piles up without a ceiling — another form of
   * "stops responding" that from the outside is indistinguishable from a hang.
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
       * `forced` means the turn was cut by hitting the max, not because the
       * person stopped talking. A lone one is normal (someone who rambles);
       * several in a row are the signature of the VAD latched onto noise, and
       * until now that datum existed in the `Utterance` type and no one read it.
       * It's exactly what you need to see in the log when it "stops responding".
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
        // Slower than real time means the queue can only grow.
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

/** An isolated 500 doesn't condemn the session; several in a row do. */
const SERVER_FAILURE_LIMIT = 3;

export class WhisperLocalSTT implements STTProvider {
  readonly id: STTProviderId = 'whisper-local';
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();
  private tempDir: string | null = null;
  private counter = 0;
  private stopped = false;
  /** `false` falls to the CLI, which starts a process per utterance. */
  private useServer = false;
  /** Consecutive server failures before giving up to the CLI for the whole session. */
  private serverFailures = 0;

  constructor(
    private readonly binaryPath: string,
    private readonly modelPath: string
  ) {}

  /**
   * Builds the provider checking that the assets are installed. The error
   * message points to the dashboard because that's where they're downloaded.
   */
  static create(modelId: string): WhisperLocalSTT {
    const binary = findWhisperBinary();
    if (!binary) {
      throw new Error(m('err.whisperNoBinary'));
    }
    if (!isModelInstalled(modelId)) {
      throw new Error(m('err.whisperNoModel', { model: modelId }));
    }
    return new WhisperLocalSTT(binary, getModelPath(modelId));
  }

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.tempDir = mkdtempSync(join(tmpdir(), 'ih-whisper-'));

    // The server saves ~570 ms per turn versus launching the CLI each time. If
    // it doesn't start, the CLI is used: slower, but transcription works.
    this.useServer = await whisperServer.ensure(this.modelPath, options.language, options.vocabulary);
    this.serverFailures = 0;
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
    // The Buffer comes from the IPC; it's reinterpreted as Int16 without copying.
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

  /** Transcribes a turn: via the server if it's alive, otherwise via the CLI. */
  private async runWhisper(utterance: Utterance, options: STTStartOptions): Promise<string> {
    if (!this.tempDir) return '';

    const wav = toWav(utterance.pcm, options.sampleRate);

    if (this.useServer && whisperServer.running) {
      try {
        const text = cleanOutput(await whisperServer.transcribe(wav, options.language));
        this.serverFailures = 0;
        return text;
      } catch (err) {
        // An isolated server failure (an HTTP 500 from a memory spike, for
        // example) doesn't mean it's broken. It falls to the CLI ONLY for this
        // turn and keeps trying the server on the next one. It's only abandoned
        // for the rest of the session if the process has died or if it piles up
        // several failures in a row, which is a pattern and not a stumble.
        this.serverFailures++;
        const dead = !whisperServer.running;
        const detail = err instanceof Error ? err.message : String(err);
        if (dead || this.serverFailures >= SERVER_FAILURE_LIMIT) {
          console.warn(
            `[whisper-server] ${dead ? 'caído' : `${this.serverFailures} fallos seguidos`} ` +
              `(${detail}); se continúa con whisper-cli el resto de la sesión.`
          );
          this.useServer = false;
        } else {
          console.warn(
            `[whisper-server] fallo transitorio (${detail}); este turno va por ` +
              'whisper-cli, el servidor sigue en uso.'
          );
        }
      }
    }

    const wavPath = join(this.tempDir, `u${this.counter++}.wav`);
    writeFileSync(wavPath, wav);

    const args = [
      '-m', this.modelPath,
      '-f', wavPath,
      // No timestamps or marks: we only want the text.
      '--no-timestamps',
      '--no-prints',
      // Careful: `--output-txt` is a boolean flag with NO argument. Passing it
      // "false" made whisper-cli take it as an input file ("error: input file
      // not found 'false'") and on top of that write a stray .txt next to the
      // WAV. What we want is not to pass it at all.
      // Threads: we leave one core free so as not to choke the audio capture.
      '-t', String(Math.max(2, (cpus().length || 4) - 1)),
    ];

    // The same two quality levers as in the server: beam search and bias toward
    // the user's vocabulary. Here they weigh more in time, because the CLI
    // already drags the process startup and the model load.
    args.push('-bs', '5');
    if (options.vocabulary?.length) {
      args.push('--prompt', options.vocabulary.slice(0, 60).join(', '));
    }

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
 * Runs whisper-cli over a synthetic WAV to test the whole installation.
 *
 * The real binary is run, with the real model, because the two failures that
 * have happened here were invisible any other way: the `main.exe` stub (it
 * exists, weighs the same as an executable, and exits with code 1) and the ggml
 * DLLs, which only blow up when loading the model. An `existsSync` wouldn't have
 * caught either.
 */
export async function testWhisperBinary(
  modelId: string
): Promise<{ ok: boolean; detail: string }> {
  const binary = findWhisperBinary();
  if (!binary) {
    return { ok: false, detail: m('diag.whisperNoBinary') };
  }
  if (!isModelInstalled(modelId)) {
    return { ok: false, detail: m('diag.whisperNoModel', { model: modelId }) };
  }

  const dir = mkdtempSync(join(tmpdir(), 'ih-whisper-test-'));
  const wavPath = join(dir, 'probe.wav');
  // Half a second of a low tone: enough for the model to load and the inference
  // to run. It doesn't matter what it transcribes, only that it reaches the end.
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
    return { ok: true, detail: m('diag.whisperOk', { binary }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: m('diag.whisperFailed', { binary, detail: message }) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Cleans up whisper-cli's output.
 *
 * Even with `--no-timestamps` it leaves diagnostic lines and sometimes residual
 * timestamps, so they're filtered instead of trusting the flags.
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
