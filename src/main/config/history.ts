import { app } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Conversation, ConversationSummary } from '@shared/types';

/**
 * Persistence of the conversation history.
 *
 * This **deliberately breaks** the app's original promise ("listens, doesn't
 * record"): while `settings.historyEnabled` is on, transcripts are written to
 * disk here. The decision is the user's and is documented in the README and in
 * CONTEXT.md §4; this module only implements it. If the switch is off, `save()`
 * never gets called and not even the folder is created.
 *
 * **One JSON file per conversation**, not a single index with everything inside.
 * A big file would have to be rewritten whole on every turn —with the risk of
 * losing it all in a half-written write— and deleting a conversation would force
 * rewriting the rest. With one file per conversation, saving touches only the
 * active one and deleting is an `rm`.
 */

const DIR_NAME = 'conversations';

function dir(): string {
  return join(app.getPath('userData'), DIR_NAME);
}

/** The id goes in the file name, so it can't carry separators. */
function fileFor(id: string): string {
  return join(dir(), `${id.replace(/[^a-zA-Z0-9-]/g, '')}.json`);
}

function readConversation(path: string): Conversation | null {
  try {
    let text = readFileSync(path, 'utf-8');
    // Same reason as in `store.ts`: a file someone can open with Notepad has to
    // tolerate the BOM or `JSON.parse` throws.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const parsed = JSON.parse(text) as Conversation;
    // A conversation with no id is a corrupt file or something else; it's ignored
    // instead of letting it blow up the whole list.
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Headers of all conversations, from most recent to oldest. */
export function listConversations(): ConversationSummary[] {
  const base = dir();
  if (!existsSync(base)) return [];

  const summaries: ConversationSummary[] = [];
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const conversation = readConversation(join(base, entry));
    if (!conversation) continue;
    summaries.push({
      id: conversation.id,
      title: conversation.title,
      startedAt: conversation.startedAt,
      turnCount: conversation.turns.length,
      segmentCount: conversation.segments.length,
    });
  }

  return summaries.sort((a, b) => b.startedAt - a.startedAt);
}

export function getConversation(id: string): Conversation | null {
  const path = fileFor(id);
  return existsSync(path) ? readConversation(path) : null;
}

/**
 * Atomic write: it's dumped to `.tmp` and renamed. If the process dies mid-way,
 * the previous file stays intact — it matters more here than in the settings,
 * because this can't be regenerated from defaults.
 */
export function saveConversation(conversation: Conversation): void {
  try {
    mkdirSync(dir(), { recursive: true });
    const path = fileFor(conversation.id);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(conversation, null, 2), 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    // A failed save can't take down an interview in progress.
    console.error('[history] no se pudo guardar la conversación:', err);
  }
}

export function deleteConversation(id: string): void {
  try {
    rmSync(fileFor(id), { force: true });
  } catch (err) {
    console.error('[history] no se pudo borrar la conversación:', err);
  }
}

/** Deletes the whole history. Only the dashboard button calls it. */
export function clearHistory(): void {
  try {
    rmSync(dir(), { recursive: true, force: true });
  } catch (err) {
    console.error('[history] no se pudo borrar el historial:', err);
  }
}

/** Where the history lives. The dashboard shows it so it's not a mystery. */
export function historyLocation(): string {
  return dir();
}
