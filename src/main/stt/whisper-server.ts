import { spawn, type ChildProcess } from 'node:child_process';
import { cpus } from 'node:os';
import { findWhisperServer } from './whisper-assets';

/**
 * `whisper-server` como proceso persistente.
 *
 * Lanzar `whisper-cli` una vez por intervención obliga a arrancar un proceso y
 * cargar el modelo cada vez. Medido sobre el mismo audio y los mismos hilos:
 * 2820 ms por el CLI frente a 2250 ms contra el servidor, unos **570 ms por
 * turno** que se pagaban sin necesidad.
 *
 * Lo que NO arregla, y conviene no prometer: whisper.cpp procesa siempre una
 * ventana de 30 segundos, así que el paso del encoder cuesta lo mismo con 1,7 s
 * de audio que con 8,2 s. Ese suelo es inherente al modelo, no al transporte —
 * es la razón de que los tiempos del log fueran tan planos.
 *
 * Si el servidor no arranca no pasa nada grave: `whisper-local.ts` se queda con
 * el CLI. Es más lento, pero funciona, y una función de latencia no puede
 * tumbar la transcripción entera.
 */

/** Puerto de partida. Si está ocupado se prueban los siguientes. */
const BASE_PORT = 8178;
const PORT_ATTEMPTS = 5;
/** Cargar `small` desde disco frío puede pasar de diez segundos. */
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
   * Arranca el servidor si hace falta. Devuelve `false` si no se pudo, para que
   * quien llama caiga al CLI en lugar de quedarse sin transcripción.
   *
   * Las llamadas concurrentes comparten la misma promesa: dos carriles
   * arrancando a la vez levantarían dos servidores peleándose por el puerto.
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
           * Búsqueda por haces en lugar de decodificación voraz.
           *
           * Es la palanca que más ayuda con un acento marcado o con audio
           * regular: en lugar de quedarse con el token más probable en cada
           * paso, mantiene varias hipótesis y elige la mejor frase completa.
           * Con el modelo residente hay margen de sobra para pagarlo — el
           * turno estaba en 230 ms, no en 1440.
           */
          '-bs', '5',
          // Prompt inicial: sesga el decodificador hacia los nombres propios,
          // siglas y tecnologías de los context packs, que es justo lo que un
          // reconocedor generalista destroza. Se acota porque el prompt compite
          // por la ventana de contexto con el audio.
          ...(vocabulary?.length ? ['--prompt', vocabulary.slice(0, 60).join(', ')] : []),
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );

      // Hay que consumir stdout/stderr: si nadie lee, el buffer del pipe se
      // llena y el proceso se queda bloqueado escribiendo.
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

  /** Sondea hasta que el puerto responde algo. Un 404 vale: el proceso vive. */
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

  /** Transcribe un WAV completo. Lanza si el servidor contesta mal. */
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
 * Instancia única. El modelo ocupa cientos de megas en memoria: un servidor por
 * hablante duplicaría ese coste para transcribir la mitad de audio cada uno.
 */
export const whisperServer = new WhisperServer();
