import { app } from 'electron';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  rmSync,
  type Dirent,
} from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Descarga y verificación de lo que necesita Whisper local: el ejecutable de
 * whisper.cpp y un modelo GGML.
 *
 * Se usa el BINARIO PRECOMPILADO en lugar de un binding nativo (`smart-whisper`,
 * `nodejs-whisper`). Razón: un binding nativo hay que recompilarlo contra el ABI
 * de Electron con `electron-rebuild`, lo que exige Visual Studio Build Tools
 * (~5 GB) y node-gyp en la máquina del usuario, y se rompe en cada actualización
 * de Electron. El binario oficial son 7,6 MB, no tiene acoplamiento de ABI y se
 * empaqueta sin ceremonia.
 *
 * Nada de esto se descarga hasta que el usuario elige Whisper local en el
 * dashboard: no tiene sentido bajar 200 MB a quien va a usar Gemini.
 */

const WHISPER_VERSION = 'v1.9.1';
const BINARY_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;

/** Modelos GGML. Tamaños verificados contra Hugging Face. */
export const WHISPER_MODELS = [
  { id: 'tiny', label: 'Tiny (74 MB) — el más rápido, menos preciso', sizeMB: 74 },
  { id: 'base', label: 'Base (141 MB) — equilibrado, recomendado', sizeMB: 141 },
  { id: 'small', label: 'Small (465 MB) — más preciso, más lento', sizeMB: 465 },
] as const;

export type WhisperModelId = (typeof WHISPER_MODELS)[number]['id'];

const modelUrl = (id: string): string =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`;

export interface DownloadProgress {
  /** Qué se está descargando. */
  target: 'binary' | 'model';
  receivedBytes: number;
  /** `0` si el servidor no envía Content-Length. */
  totalBytes: number;
}

const whisperDir = (): string => join(app.getPath('userData'), 'whisper');
const modelPath = (id: string): string => join(whisperDir(), `ggml-${id}.bin`);
const binDir = (): string => join(whisperDir(), 'bin');

/**
 * Localiza el ejecutable. El nombre ha cambiado entre versiones de whisper.cpp
 * (`main.exe` → `whisper-cli.exe`), y el zip no tiene una estructura estable,
 * así que se busca en lugar de asumir una ruta.
 */
export function findWhisperBinary(): string | null {
  const dir = binDir();
  if (!existsSync(dir)) return null;

  const candidates = ['whisper-cli.exe', 'main.exe', 'whisper.exe'];
  const search = (current: string, depth: number): string | null => {
    if (depth > 3) return null;
    // `Dirent[]` explícito: sin él TypeScript elige la sobrecarga de Buffer de
    // readdirSync y `entry.name` deja de ser string.
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isFile() && candidates.includes(entry.name.toLowerCase())) return full;
      if (entry.isDirectory()) {
        const found = search(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  return search(dir, 0);
}

export function isModelInstalled(id: string): boolean {
  const path = modelPath(id);
  // Un archivo truncado por una descarga interrumpida existe pero no sirve; el
  // umbral descarta esos casos sin tener que verificar el hash completo.
  return existsSync(path) && statSync(path).size > 20 * 1024 * 1024;
}

export function getModelPath(id: string): string {
  return modelPath(id);
}

/** Estado de instalación, para pintar el dashboard. */
export function getWhisperStatus(modelId: string): {
  binaryInstalled: boolean;
  modelInstalled: boolean;
} {
  return {
    binaryInstalled: findWhisperBinary() !== null,
    modelInstalled: isModelInstalled(modelId),
  };
}

/** Descarga a un archivo temporal y renombra al final: nunca deja algo a medias. */
async function download(
  url: string,
  destination: string,
  target: DownloadProgress['target'],
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`No se pudo descargar ${url}: HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0);
  let receivedBytes = 0;
  let lastReport = 0;

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
    // Reporta cada 250 ms: a cada chunk saturaría el IPC en una descarga de
    // cientos de megas.
    const now = Date.now();
    if (now - lastReport > 250) {
      lastReport = now;
      onProgress?.({ target, receivedBytes, totalBytes });
    }
  });

  mkdirSync(join(destination, '..'), { recursive: true });
  const temp = `${destination}.part`;
  await pipeline(source, createWriteStream(temp));

  const { renameSync } = await import('node:fs');
  renameSync(temp, destination);
  onProgress?.({ target, receivedBytes, totalBytes });
}

/**
 * Instala el ejecutable de whisper.cpp.
 *
 * Se descomprime con `tar.exe`, presente de serie en Windows 10 1803+, para no
 * añadir una dependencia de unzip por una operación que se hace una vez.
 */
export async function ensureBinary(onProgress?: (p: DownloadProgress) => void): Promise<string> {
  const existing = findWhisperBinary();
  if (existing) return existing;

  const dir = binDir();
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, 'whisper.zip');

  await download(BINARY_URL, zip, 'binary', onProgress);

  try {
    await promisify(execFile)('tar', ['-xf', zip, '-C', dir]);
  } catch (err) {
    throw new Error(
      `No se pudo descomprimir el binario de Whisper: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    );
  } finally {
    rmSync(zip, { force: true });
  }

  const binary = findWhisperBinary();
  if (!binary) {
    throw new Error('El zip de whisper.cpp se descomprimió pero no contenía el ejecutable.');
  }
  return binary;
}

export async function ensureModel(
  id: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<string> {
  if (isModelInstalled(id)) return modelPath(id);
  await download(modelUrl(id), modelPath(id), 'model', onProgress);
  return modelPath(id);
}

/** Descarga lo que falte. Lo llama el dashboard antes de activar Whisper local. */
export async function ensureWhisperReady(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ binary: string; model: string }> {
  const binary = await ensureBinary(onProgress);
  const model = await ensureModel(modelId, onProgress);
  return { binary, model };
}
