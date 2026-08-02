import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * «Configurada» tiene que significar «sirve», no «hay bytes escritos».
 *
 * El fallo que esto fija se descubrió al añadir el asistente de configuración:
 * la pantalla decía «ya tienes una clave» y, dos segundos después, la prueba de
 * conexión contestaba «falta la API key». Las dos cosas venían del mismo
 * archivo — pero `getPresence` sólo miraba que el campo existiera y `getSecret`
 * intentaba descifrarlo de verdad.
 *
 * Pasa cuando el ciphertext lo escribió otro perfil de Windows u otra
 * instalación: el valor sigue ahí y `safeStorage` no puede abrirlo. El síntoma
 * era un dashboard en verde con todas las respuestas fallando.
 */

let userData = '';

/** `decryptString` se controla por test: es la diferencia entre "hay" y "sirve". */
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

/** Deja un secreto guardado sin pasar por `setSecret`, como el de una sesión anterior. */
function seed(value: Record<string, string>): void {
  writeFileSync(join(userData, 'secrets.json'), JSON.stringify(value), 'utf-8');
}

describe('presencia de las API keys', () => {
  it('dice que hay clave cuando de verdad se puede leer', async () => {
    seed({ anthropic: Buffer.from('sk-real').toString('base64') });
    decryptString.mockImplementation((buffer) => buffer.toString('utf-8'));

    const { getPresence } = await secrets();
    expect(getPresence()).toEqual({ anthropic: true, google: false, openai: false, mqtt: false });
  });

  it('dice que NO hay clave cuando el ciphertext no se puede descifrar', async () => {
    // Escrita por otro perfil de Windows: el campo está, el contenido no se abre.
    seed({ anthropic: 'algo-que-no-es-de-este-perfil' });
    decryptString.mockImplementation(() => {
      throw new Error('Error while decrypting the ciphertext provided to safeStorage');
    });

    const { getPresence } = await secrets();
    // Antes esto devolvía `true` y el dashboard lo pintaba en verde mientras
    // todas las consultas fallaban con "Falta la API key".
    expect(getPresence()).toEqual({ anthropic: false, google: false, openai: false, mqtt: false });
  });

  it('no confunde una clave rota con la otra', async () => {
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
    expect(getPresence()).toEqual({ anthropic: false, google: true, openai: false, mqtt: false });
  });
});
