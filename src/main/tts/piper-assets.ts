import { app } from 'electron';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  type Dirent,
} from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PiperStatus, TtsPiperProgress } from '@shared/ipc';
import { PIPER_VOICES, piperVoiceById, piperVoiceUrl } from '@shared/piper-voices';
import { m } from '../i18n';

/**
 * Download and disk layout for Piper, the local neural TTS.
 *
 * The same shape as Whisper's assets (see `stt/whisper-assets.ts`): a precompiled
 * binary and downloadable models, nothing fetched until the user actually picks
 * Piper. The binary is the official release zip —piper.exe plus its onnxruntime
 * DLLs and `espeak-ng-data`— and each voice is two files: the `.onnx` model and
 * its `.onnx.json` config.
 */

const PIPER_VERSION = '2023.11.14-2';
const BINARY_URL = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_windows_amd64.zip`;

const piperDir = (): string => join(app.getPath('userData'), 'piper');
const binDir = (): string => join(piperDir(), 'bin');
const voicesDir = (): string => join(piperDir(), 'voices');
const voicePath = (id: string): string => join(voicesDir(), `${id}.onnx`);

const BINARY_CANDIDATES = ['piper.exe'];

export function findPiperBinary(): string | null {
  const dir = binDir();
  if (!existsSync(dir)) return null;

  const found = new Map<string, string>();
  const search = (current: string, depth: number): void => {
    if (depth > 3) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      const name = entry.name.toLowerCase();
      if (entry.isFile() && BINARY_CANDIDATES.includes(name) && !found.has(name)) {
        found.set(name, full);
      }
      if (entry.isDirectory()) search(full, depth + 1);
    }
  };
  search(dir, 0);

  for (const candidate of BINARY_CANDIDATES) {
    const path = found.get(candidate);
    if (path) return path;
  }
  return null;
}

export function isVoiceInstalled(id: string): boolean {
  const onnx = voicePath(id);
  // A `.onnx` truncated by an interrupted download exists but is useless; the
  // threshold discards those without hashing. The `.onnx.json` config must be
  // there too, or piper can't load the voice.
  return (
    existsSync(onnx) &&
    statSync(onnx).size > 1024 * 1024 &&
    existsSync(`${onnx}.json`)
  );
}

export function getVoicePath(id: string): string {
  return voicePath(id);
}

/** Installation state, for painting the dashboard. */
export function getPiperStatus(): PiperStatus {
  return {
    binaryInstalled: findPiperBinary() !== null,
    installedVoices: PIPER_VOICES.filter((v) => isVoiceInstalled(v.id)).map((v) => v.id),
  };
}

/** Downloads to a temp file and renames at the end: never leaves something half-done. */
async function download(
  url: string,
  destination: string,
  target: TtsPiperProgress['target'],
  onProgress?: (p: TtsPiperProgress) => void
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(m('tts.err.piperDownload', { url, status: response.status }));
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0);
  let receivedBytes = 0;
  let lastReport = 0;

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
    const now = Date.now();
    if (now - lastReport > 250) {
      lastReport = now;
      onProgress?.({ target, receivedBytes, totalBytes });
    }
  });

  mkdirSync(join(destination, '..'), { recursive: true });
  const temp = `${destination}.part`;
  await pipeline(source, createWriteStream(temp));
  renameSync(temp, destination);
  onProgress?.({ target, receivedBytes, totalBytes });
}

/**
 * Installs the piper executable, unzipped with `tar.exe` (present on Windows 10
 * 1803+), same as the Whisper binary.
 */
async function ensureBinary(onProgress?: (p: TtsPiperProgress) => void): Promise<string> {
  const existing = findPiperBinary();
  if (existing) return existing;

  const dir = binDir();
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, 'piper.zip');

  await download(BINARY_URL, zip, 'binary', onProgress);

  try {
    await promisify(execFile)('tar', ['-xf', zip, '-C', dir]);
  } catch (err) {
    throw new Error(m('tts.err.piperUnzip', { detail: err instanceof Error ? err.message : String(err) }), {
      cause: err,
    });
  } finally {
    rmSync(zip, { force: true });
  }

  const binary = findPiperBinary();
  if (!binary) throw new Error(m('tts.err.piperNoExe'));
  return binary;
}

/** Downloads a voice's model and config if missing. */
async function ensureVoice(
  id: string,
  onProgress?: (p: TtsPiperProgress) => void
): Promise<void> {
  if (isVoiceInstalled(id)) return;
  const voice = piperVoiceById(id);
  if (!voice) throw new Error(m('tts.err.piperUnknownVoice', { id }));

  await download(piperVoiceUrl(voice), voicePath(id), 'voice', onProgress);
  // The config is a few KB; no separate progress for it.
  await download(piperVoiceUrl(voice, true), `${voicePath(id)}.json`, 'voice');
}

/** Downloads the binary (once) and the chosen voice. The dashboard calls it to install. */
export async function ensurePiperReady(
  voiceId: string,
  onProgress?: (p: TtsPiperProgress) => void
): Promise<void> {
  await ensureBinary(onProgress);
  await ensureVoice(voiceId, onProgress);
}
