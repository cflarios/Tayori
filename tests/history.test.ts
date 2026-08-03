import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { conversationTitle, type Conversation } from '../src/shared/types';

/**
 * El store escribe en `app.getPath('userData')`. Se apunta a un directorio
 * temporal por test para no tocar el perfil real ni depender del orden.
 */
let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

async function store(): Promise<typeof import('../src/main/config/history')> {
  return import('../src/main/config/history');
}

function conversation(patch: Partial<Conversation> = {}): Conversation {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'Entrevista de prueba',
    startedAt: 1_000,
    profileId: 'interview',
    segments: [
      {
        id: 'seg-1',
        speaker: 'them',
        text: '¿Qué es un closure?',
        isFinal: true,
        startedAt: 1_100,
      },
    ],
    turns: [
      {
        id: 'turn-1',
        question: '¿Qué es un closure?',
        answer: 'Una función que captura su entorno.',
        trigger: 'auto',
        providerId: 'ollama',
        model: 'llama3.2:3b',
        createdAt: 1_200,
      },
    ],
    ...patch,
  };
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ih-history-test-'));
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('store de conversaciones', () => {
  it('guarda y recupera una conversación entera', async () => {
    const { saveConversation, getConversation } = await store();
    const original = conversation();

    saveConversation(original);
    const loaded = getConversation(original.id);

    expect(loaded).toEqual(original);
    // Lo que de verdad importa del historial: la transcripción sobrevive.
    expect(loaded?.segments[0]?.text).toBe('¿Qué es un closure?');
  });

  it('lista cabeceras de la más reciente a la más antigua', async () => {
    const { saveConversation, listConversations } = await store();

    saveConversation(conversation({ id: 'antigua', startedAt: 1_000, title: 'Primera' }));
    saveConversation(conversation({ id: 'reciente', startedAt: 9_000, title: 'Segunda' }));

    const list = listConversations();
    expect(list.map((c) => c.id)).toEqual(['reciente', 'antigua']);
    // La cabecera trae los contadores para no abrir cada archivo al pintar.
    expect(list[0]?.turnCount).toBe(1);
    expect(list[0]?.segmentCount).toBe(1);
  });

  it('borra una sola conversación sin tocar las demás', async () => {
    const { saveConversation, deleteConversation, listConversations } = await store();

    saveConversation(conversation({ id: 'uno' }));
    saveConversation(conversation({ id: 'dos' }));
    deleteConversation('uno');

    expect(listConversations().map((c) => c.id)).toEqual(['dos']);
  });

  it('borra el historial entero', async () => {
    const { saveConversation, clearHistory, listConversations } = await store();

    saveConversation(conversation({ id: 'uno' }));
    saveConversation(conversation({ id: 'dos' }));
    clearHistory();

    expect(listConversations()).toEqual([]);
  });

  it('ignora archivos corruptos en lugar de tumbar la lista entera', async () => {
    const { saveConversation, listConversations, historyLocation } = await store();

    saveConversation(conversation({ id: 'buena' }));
    writeFileSync(join(historyLocation(), 'rota.json'), '{ esto no es json', 'utf-8');

    // Un archivo ilegible no puede impedir ver el resto del historial.
    expect(listConversations().map((c) => c.id)).toEqual(['buena']);
  });

  it('tolera BOM, como el store de settings', async () => {
    const { saveConversation, getConversation, historyLocation } = await store();
    const original = conversation({ id: 'conbom' });

    saveConversation(original);
    // Construido, no escrito literal: un BOM suelto en el fuente lo caza
    // `no-irregular-whitespace`, y con razón — es invisible al leer el test.
    const BOM = String.fromCharCode(0xfeff);
    const path = join(historyLocation(), 'conbom.json');
    writeFileSync(path, BOM + JSON.stringify(original), 'utf-8');

    expect(getConversation('conbom')?.title).toBe('Entrevista de prueba');
  });

  it('no deja archivos .tmp tras guardar', async () => {
    const { saveConversation, historyLocation } = await store();

    saveConversation(conversation());

    // La escritura es tmp + rename; un .tmp superviviente sería una escritura
    // a medias que la próxima lista intentaría leer.
    expect(readdirSync(historyLocation()).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('conversationTitle', () => {
  it('recorta títulos largos y normaliza espacios', () => {
    expect(conversationTitle('  Hola   mundo  ')).toBe('Hola mundo');
    // Sin nada aprovechable devuelve vacío, no un rótulo: el «sin título» lo
    // pone el dashboard, que es el único que sabe en qué idioma se está viendo.
    expect(conversationTitle('')).toBe('');
    expect(conversationTitle('x'.repeat(200))).toHaveLength(58);
  });
});
