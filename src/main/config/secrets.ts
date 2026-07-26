import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SecretKey, SecretsPresence } from '@shared/types';

/**
 * Almacenamiento de API keys cifrado con `safeStorage`, que en Windows delega
 * en DPAPI: el ciphertext sólo se puede descifrar con la cuenta de usuario
 * de Windows que lo creó.
 *
 * Reglas que no se rompen:
 *   - Las keys NUNCA cruzan el puente IPC hacia el renderer. El dashboard sólo
 *     recibe un booleano de "está configurada o no" (`SecretsPresence`).
 *   - Las keys NUNCA se escriben en texto plano ni acaban en el repo.
 */

type SecretsFile = Partial<Record<SecretKey, string>>; // valores en base64 cifrado

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
 * En entornos sin backend de cifrado disponible (algunos Linux sin keyring)
 * preferimos fallar antes que guardar en claro.
 */
function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'El cifrado del sistema no está disponible; no se guardará la API key en texto plano.'
    );
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
    // Ocurre si el perfil de Windows cambió o el archivo se copió de otra máquina.
    console.error(`[secrets] no se pudo descifrar "${key}":`, err);
    return null;
  }
}

export function clearSecret(key: SecretKey): void {
  const data = read();
  delete data[key];
  write(data);
}

/** Lo único sobre secretos que el renderer tiene permitido saber. */
export function getPresence(): SecretsPresence {
  const data = read();
  return {
    anthropic: Boolean(data.anthropic),
    google: Boolean(data.google),
  };
}
