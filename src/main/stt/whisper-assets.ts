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
import { m } from '../i18n';
import { WHISPER_MODELS, whisperModelById } from '@shared/whisper-models';

/**
 * Download and verification of what Whisper local needs: the whisper.cpp
 * executable and a GGML model.
 *
 * The PRECOMPILED BINARY is used instead of a native binding (`smart-whisper`,
 * `nodejs-whisper`). Reason: a native binding has to be recompiled against
 * Electron's ABI with `electron-rebuild`, which requires Visual Studio Build
 * Tools (~5 GB) and node-gyp on the user's machine, and breaks on every Electron
 * update. The official binary is 7.6 MB, has no ABI coupling and is packaged
 * without ceremony.
 *
 * None of this is downloaded until the user chooses Whisper local in the
 * dashboard: there's no point downloading 200 MB for someone who's going to use
 * Gemini.
 */

const WHISPER_VERSION = 'v1.9.1';
const BINARY_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;

/**
 * Download URL of a model: the explicit one from the catalog (the Distils) or
 * the whisper.cpp official repo pattern for the rest.
 */
const modelUrl = (id: string): string =>
  whisperModelById(id)?.url ??
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`;

export interface DownloadProgress {
  /** What's being downloaded. */
  target: 'binary' | 'model';
  receivedBytes: number;
  /** `0` if the server doesn't send Content-Length. */
  totalBytes: number;
}

const whisperDir = (): string => join(app.getPath('userData'), 'whisper');
const modelPath = (id: string): string => join(whisperDir(), `ggml-${id}.bin`);
const binDir = (): string => join(whisperDir(), 'bin');

/**
 * Valid executable names, IN ORDER OF PREFERENCE. The name changed between
 * whisper.cpp versions and the zip has no stable structure, so it's searched for
 * instead of assuming a path.
 *
 * `main.exe` is NOT here on purpose: since whisper.cpp 1.7 it's a deprecation
 * stub that prints "the binary 'main.exe' is deprecated" and exits with code 1.
 * Since the zip still brings it and it sorts before `whisper-cli.exe`, a search
 * by directory order picked it and local transcription failed entirely, with a
 * `Command failed` for every utterance.
 */
const BINARY_CANDIDATES = ['whisper-cli.exe', 'whisper.exe'];

/**
 * The server comes in the same zip and keeps the model loaded between requests.
 * Measured over the same audio: 2820 ms launching `whisper-cli` per turn against
 * 2250 ms against the server — some 570 ms of process and model loading paid for
 * on every utterance.
 */
const SERVER_CANDIDATES = ['whisper-server.exe'];

export function findWhisperBinary(): string | null {
  return findExecutable(BINARY_CANDIDATES);
}

export function findWhisperServer(): string | null {
  return findExecutable(SERVER_CANDIDATES);
}

function findExecutable(candidates: string[]): string | null {
  const dir = binDir();
  if (!existsSync(dir)) return null;

  /** All matches, indexed by lowercase name. */
  const found = new Map<string, string>();

  const search = (current: string, depth: number): void => {
    if (depth > 3) return;
    // Explicit `Dirent[]`: without it TypeScript picks readdirSync's Buffer
    // overload and `entry.name` stops being a string.
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      const name = entry.name.toLowerCase();
      if (entry.isFile() && candidates.includes(name) && !found.has(name)) {
        found.set(name, full);
      }
      if (entry.isDirectory()) search(full, depth + 1);
    }
  };

  search(dir, 0);

  // Chosen by the array's priority, not by directory order: it's the only way
  // for an obsolete name that sorts first not to win.
  for (const candidate of candidates) {
    const path = found.get(candidate);
    if (path) return path;
  }
  return null;
}

export function isModelInstalled(id: string): boolean {
  const path = modelPath(id);
  // A file truncated by an interrupted download exists but is useless; the
  // threshold discards those cases without having to verify the full hash.
  return existsSync(path) && statSync(path).size > 20 * 1024 * 1024;
}

export function getModelPath(id: string): string {
  return modelPath(id);
}

/** Installation state, for painting the dashboard. */
export function getWhisperStatus(modelId: string): {
  binaryInstalled: boolean;
  modelInstalled: boolean;
  /** Which catalog models have their .bin on disk, for the Model Manager. */
  installed: string[];
} {
  return {
    binaryInstalled: findWhisperBinary() !== null,
    modelInstalled: isModelInstalled(modelId),
    installed: WHISPER_MODELS.filter((mdl) => isModelInstalled(mdl.id)).map((mdl) => mdl.id),
  };
}

/** Downloads to a temp file and renames at the end: never leaves something half-done. */
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
    // Reports every 250 ms: reporting on every chunk would saturate the IPC on a
    // download of hundreds of megs.
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
 * Installs the whisper.cpp executable.
 *
 * It's unzipped with `tar.exe`, present by default on Windows 10 1803+, so as
 * not to add an unzip dependency for an operation done once.
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
      m('err.whisperUnzip', { detail: err instanceof Error ? err.message : String(err) }),
      { cause: err }
    );
  } finally {
    rmSync(zip, { force: true });
  }

  const binary = findWhisperBinary();
  if (!binary) {
    throw new Error(m('err.whisperNoExe'));
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

/** Downloads whatever's missing. The dashboard calls it before enabling Whisper local. */
export async function ensureWhisperReady(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ binary: string; model: string }> {
  const binary = await ensureBinary(onProgress);
  const model = await ensureModel(modelId, onProgress);
  return { binary, model };
}
