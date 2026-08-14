import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SecretKey, SecretsPresence } from '@shared/types';
import { m } from '../i18n';

/**
 * API key storage encrypted with `safeStorage`, which on Windows delegates to
 * DPAPI: the ciphertext can only be decrypted with the Windows user account that
 * created it.
 *
 * Rules that don't get broken:
 *   - The keys NEVER cross the IPC bridge to the renderer. The dashboard only
 *     gets a "configured or not" boolean (`SecretsPresence`).
 *   - The keys are NEVER written in plain text or end up in the repo.
 */

type SecretsFile = Partial<Record<SecretKey, string>>; // values in encrypted base64

const secretsPath = (): string => join(app.getPath('userData'), 'secrets.json');

function read(): SecretsFile {
  try {
    const file = secretsPath();
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf-8')) as SecretsFile;
  } catch (err) {
    console.error('[secrets] no se pudo leer:', err);
    return {};
  }
}

function write(data: SecretsFile): void {
  const file = secretsPath();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * In environments with no encryption backend available (some Linux without a
 * keyring) we prefer to fail rather than store in the clear.
 */
function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(m('err.noEncryption'));
  }
}

export function setSecret(key: SecretKey, value: string): void {
  assertEncryptionAvailable();
  const data = read();
  const trimmed = value.trim();

  if (!trimmed) {
    delete data[key];
  } else {
    data[key] = safeStorage.encryptString(trimmed).toString('base64');
  }
  write(data);
}

export function getSecret(key: SecretKey): string | null {
  const stored = read()[key];
  if (!stored) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch (err) {
    // Happens if the Windows profile changed or the file was copied from another machine.
    console.error(`[secrets] no se pudo descifrar "${key}":`, err);
    return null;
  }
}

export function clearSecret(key: SecretKey): void {
  const data = read();
  delete data[key];
  write(data);
}

/**
 * The only thing about secrets the renderer is allowed to know.
 *
 * It asks whether the key **works**, not whether it's written. The previous
 * version only checked that the field existed in the file, and that turned out
 * to be an expensive half-truth: `safeStorage` decrypts with the Windows
 * profile's identity, so a key saved by another installation —or by a profile
 * that changed— is still there, taking up its spot, and fails to decrypt.
 *
 * The result was the worst possible one: the dashboard put "configured" in green
 * and **all** answers failed with "Anthropic API key missing", which sends you to
 * configure something that already looks configured. It was discovered when
 * adding the wizard, which tests the connection right after saying the key is set
 * and contradicted itself on the same screen.
 *
 * Decrypting two short strings is free next to that, and `getSecret` already
 * leaves the real cause in the log when it fails.
 */
export function getPresence(): SecretsPresence {
  return {
    anthropic: Boolean(getSecret('anthropic')),
    google: Boolean(getSecret('google')),
    openai: Boolean(getSecret('openai')),
    deepseek: Boolean(getSecret('deepseek')),
    mqtt: Boolean(getSecret('mqtt')),
  };
}
