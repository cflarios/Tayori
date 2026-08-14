import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { conversationTitle, type Conversation } from '../src/shared/types';

/**
 * The store writes to `app.getPath('userData')`. It's pointed at a temporary
 * directory per test so as not to touch the real profile or depend on order.
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

describe('conversation store', () => {
  it('saves and recovers a whole conversation', async () => {
    const { saveConversation, getConversation } = await store();
    const original = conversation();

    saveConversation(original);
    const loaded = getConversation(original.id);

    expect(loaded).toEqual(original);
    // What really matters about the history: the transcript survives.
    expect(loaded?.segments[0]?.text).toBe('¿Qué es un closure?');
  });

  it('lists headers from most recent to oldest', async () => {
    const { saveConversation, listConversations } = await store();

    saveConversation(conversation({ id: 'antigua', startedAt: 1_000, title: 'Primera' }));
    saveConversation(conversation({ id: 'reciente', startedAt: 9_000, title: 'Segunda' }));

    const list = listConversations();
    expect(list.map((c) => c.id)).toEqual(['reciente', 'antigua']);
    // The header carries the counters so as not to open each file when painting.
    expect(list[0]?.turnCount).toBe(1);
    expect(list[0]?.segmentCount).toBe(1);
  });

  it('deletes a single conversation without touching the others', async () => {
    const { saveConversation, deleteConversation, listConversations } = await store();

    saveConversation(conversation({ id: 'uno' }));
    saveConversation(conversation({ id: 'dos' }));
    deleteConversation('uno');

    expect(listConversations().map((c) => c.id)).toEqual(['dos']);
  });

  it('deletes the whole history', async () => {
    const { saveConversation, clearHistory, listConversations } = await store();

    saveConversation(conversation({ id: 'uno' }));
    saveConversation(conversation({ id: 'dos' }));
    clearHistory();

    expect(listConversations()).toEqual([]);
  });

  it('ignores corrupt files instead of taking down the whole list', async () => {
    const { saveConversation, listConversations, historyLocation } = await store();

    saveConversation(conversation({ id: 'buena' }));
    writeFileSync(join(historyLocation(), 'rota.json'), '{ esto no es json', 'utf-8');

    // An unreadable file can't prevent seeing the rest of the history.
    expect(listConversations().map((c) => c.id)).toEqual(['buena']);
  });

  it('tolerates a BOM, like the settings store', async () => {
    const { saveConversation, getConversation, historyLocation } = await store();
    const original = conversation({ id: 'conbom' });

    saveConversation(original);
    // Built, not written literally: a lone BOM in the source is caught by
    // `no-irregular-whitespace`, and rightly so — it's invisible when reading the test.
    const BOM = String.fromCharCode(0xfeff);
    const path = join(historyLocation(), 'conbom.json');
    writeFileSync(path, BOM + JSON.stringify(original), 'utf-8');

    expect(getConversation('conbom')?.title).toBe('Entrevista de prueba');
  });

  it("doesn't leave .tmp files after saving", async () => {
    const { saveConversation, historyLocation } = await store();

    saveConversation(conversation());

    // The write is tmp + rename; a surviving .tmp would be a half-written write
    // that the next listing would try to read.
    expect(readdirSync(historyLocation()).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('conversationTitle', () => {
  it('trims long titles and normalizes spaces', () => {
    expect(conversationTitle('  Hola   mundo  ')).toBe('Hola mundo');
    // With nothing usable it returns empty, not a label: the «untitled» is put
    // by the dashboard, the only one that knows which language it's being viewed in.
    expect(conversationTitle('')).toBe('');
    expect(conversationTitle('x'.repeat(200))).toHaveLength(58);
  });
});
