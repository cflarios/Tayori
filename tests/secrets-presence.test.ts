import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * «Configured» has to mean «works», not «there are bytes written».
 *
 * The bug this pins was discovered when adding the setup wizard: the screen said
 * «you already have a key» and, two seconds later, the connection test replied
 * «the API key is missing». Both came from the same file — but `getPresence` only
 * checked that the field existed and `getSecret` actually tried to decrypt it.
 *
 * It happens when the ciphertext was written by another Windows profile or
 * installation: the value is still there and `safeStorage` can't open it. The
 * symptom was a green dashboard with every answer failing.
 */

let userData = '';

/** `decryptString` is controlled per test: it's the difference between "exists" and "works". */
const decryptString = vi.fn<(buffer: Buffer) => string>();

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf-8'),
    decryptString: (buffer: Buffer) => decryptString(buffer),
  },
}));

async function secrets(): Promise<typeof import('../src/main/config/secrets')> {
  return import('../src/main/config/secrets');
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ih-secrets-'));
  vi.resetModules();
  decryptString.mockReset();
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

/** Leaves a secret saved without going through `setSecret`, like one from an earlier session. */
function seed(value: Record<string, string>): void {
  writeFileSync(join(userData, 'secrets.json'), JSON.stringify(value), 'utf-8');
}

describe('presence of the API keys', () => {
  it('says there is a key when it can really be read', async () => {
    seed({ anthropic: Buffer.from('sk-real').toString('base64') });
    decryptString.mockImplementation((buffer) => buffer.toString('utf-8'));

    const { getPresence } = await secrets();
    expect(getPresence()).toEqual({ anthropic: true, google: false, openai: false, deepseek: false, mqtt: false });
  });

  it("says there is NO key when the ciphertext can't be decrypted", async () => {
    // Written by another Windows profile: the field is there, the content won't open.
    seed({ anthropic: 'algo-que-no-es-de-este-perfil' });
    decryptString.mockImplementation(() => {
      throw new Error('Error while decrypting the ciphertext provided to safeStorage');
    });

    const { getPresence } = await secrets();
    // Before, this returned `true` and the dashboard painted it green while every
    // query failed with "Falta la API key".
    expect(getPresence()).toEqual({ anthropic: false, google: false, openai: false, deepseek: false, mqtt: false });
  });

  it("doesn't confuse one broken key with the other", async () => {
    seed({
      anthropic: 'rota',
      google: Buffer.from('AIza-buena').toString('base64'),
    });
    decryptString.mockImplementation((buffer) => {
      const text = buffer.toString('utf-8');
      if (!text.startsWith('AIza')) throw new Error('no se puede descifrar');
      return text;
    });

    const { getPresence } = await secrets();
    expect(getPresence()).toEqual({ anthropic: false, google: true, openai: false, deepseek: false, mqtt: false });
  });
});
