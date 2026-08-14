import { spawn, type ChildProcess } from 'node:child_process';
import { cpus } from 'node:os';
import { findWhisperServer } from './whisper-assets';

/**
 * `whisper-server` as a persistent process.
 *
 * Launching `whisper-cli` once per utterance forces starting a process and
 * loading the model each time. Measured over the same audio and the same
 * threads: 2820 ms via the CLI against 2250 ms against the server, some **570 ms
 * per turn** paid for nothing.
 *
 * What it does NOT fix, and it's best not to promise: whisper.cpp always
 * processes a 30-second window, so the encoder pass costs the same with 1.7 s of
 * audio as with 8.2 s. That floor is inherent to the model, not the transport —
 * it's the reason the log times were so flat.
 *
 * If the server doesn't start nothing bad happens: `whisper-local.ts` sticks
 * with the CLI. It's slower, but it works, and a latency feature can't take down
 * transcription entirely.
 */

/** Starting port. If it's taken, the next ones are tried. */
const BASE_PORT = 8178;
const PORT_ATTEMPTS = 5;
/** Loading `small` from cold disk can take more than ten seconds. */
const READY_TIMEOUT_MS = 60_000;

export class WhisperServer {
  private process: ChildProcess | null = null;
  private port = 0;
  private starting: Promise<boolean> | null = null;

  get endpoint(): string {
    return `http://127.0.0.1:${this.port}/inference`;
  }

  get running(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Starts the server if needed. Returns `false` if it couldn't, so the caller
   * falls to the CLI instead of being left with no transcription.
   *
   * Concurrent calls share the same promise: two lanes starting at once would
   * bring up two servers fighting over the port.
   */
  async ensure(modelPath: string, language: string, vocabulary?: string[]): Promise<boolean> {
    if (this.running) return true;
    this.starting ??= this.launch(modelPath, language, vocabulary).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async launch(
    modelPath: string,
    language: string,
    vocabulary?: string[]
  ): Promise<boolean> {
    const binary = findWhisperServer();
    if (!binary) {
      console.log('[whisper-server] no está en el zip descargado; se usará whisper-cli.');
      return false;
    }

    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
      const port = BASE_PORT + attempt;
      const child = spawn(
        binary,
        [
          '-m', modelPath,
          '--host', '127.0.0.1',
          '--port', String(port),
          '-t', String(Math.max(2, (cpus().length || 4) - 1)),
          '-nt',
          '-l', language === 'auto' ? 'auto' : language.split('-')[0] || 'auto',
          /*
           * Beam search instead of greedy decoding.
           *
           * It's the lever that helps most with a marked accent or with
           * so-so audio: instead of keeping the most likely token at each step,
           * it holds several hypotheses and picks the best complete sentence.
           * With the resident model there's plenty of room to pay for it — the
           * turn was at 230 ms, not 1440.
           */
          '-bs', '5',
          // Initial prompt: biases the decoder toward the proper nouns, acronyms
          // and technologies of the context packs, which is exactly what a
          // generalist recognizer wrecks. It's capped because the prompt competes
          // with the audio for the context window.
          ...(vocabulary?.length ? ['--prompt', vocabulary.slice(0, 60).join(', ')] : []),
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );

      // stdout/stderr have to be consumed: if no one reads, the pipe's buffer
      // fills and the process gets stuck writing.
      child.stdout?.resume();
      child.stderr?.resume();

      const exited = new Promise<false>((resolve) => {
        child.once('error', () => resolve(false));
        child.once('exit', () => resolve(false));
      });

      const ready = await Promise.race([this.waitUntilReady(port), exited]);
      if (ready) {
        this.process = child;
        this.port = port;
        child.once('exit', (code) => {
          console.warn(`[whisper-server] terminó con código ${code}; se volverá al CLI.`);
          this.process = null;
        });
        console.log(`[whisper-server] escuchando en 127.0.0.1:${port} · modelo ${modelPath}`);
        return true;
      }

      child.kill();
    }

    console.warn('[whisper-server] no se pudo arrancar; se usará whisper-cli.');
    return false;
  }

  /** Polls until the port responds with something. A 404 counts: the process is alive. */
  private async waitUntilReady(port: number): Promise<boolean> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(1_000),
        });
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    return false;
  }

  /** Transcribes a complete WAV. Throws if the server answers badly. */
  async transcribe(wav: Buffer, language: string, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    form.append('response_format', 'json');
    if (language && language !== 'auto') {
      form.append('language', language.split('-')[0] ?? language);
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new Error(`whisper-server respondió HTTP ${response.status}`);
    }

    const body = (await response.json()) as { text?: string };
    return (body.text ?? '').trim();
  }

  stop(): void {
    if (!this.process) return;
    this.process.removeAllListeners('exit');
    this.process.kill();
    this.process = null;
    this.port = 0;
  }
}

/**
 * Single instance. The model takes hundreds of megs in memory: one server per
 * speaker would double that cost to transcribe half the audio each.
 */
export const whisperServer = new WhisperServer();
