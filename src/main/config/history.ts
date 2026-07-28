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
 * Persistencia del historial de conversaciones.
 *
 * Esto **rompe a propósito** la promesa original de la app ("escucha, no
 * graba"): mientras `settings.historyEnabled` esté activo, aquí se escriben
 * transcripciones a disco. La decisión es del usuario y está documentada en el
 * README y en CONTEXT.md §4; este módulo sólo la implementa. Si el interruptor
 * está apagado, `save()` no llega a llamarse y no se crea ni la carpeta.
 *
 * **Un archivo JSON por conversación**, no un único índice con todo dentro. Un
 * archivo grande habría que reescribirlo entero en cada turno —con el riesgo de
 * perderlo todo en una escritura a medias— y borrar una conversación obligaría
 * a reescribir el resto. Con un archivo por conversación, guardar toca sólo la
 * activa y borrar es un `rm`.
 */

const DIR_NAME = 'conversations';

function dir(): string {
  return join(app.getPath('userData'), DIR_NAME);
}

/** El id va en el nombre del archivo, así que no puede traer separadores. */
function fileFor(id: string): string {
  return join(dir(), `${id.replace(/[^a-zA-Z0-9-]/g, '')}.json`);
}

function readConversation(path: string): Conversation | null {
  try {
    let text = readFileSync(path, 'utf-8');
    // Mismo motivo que en `store.ts`: un archivo que alguien puede abrir con
    // Notepad tiene que tolerar el BOM o `JSON.parse` lanza.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const parsed = JSON.parse(text) as Conversation;
    // Una conversación sin id es un archivo corrupto o de otra cosa; se ignora
    // en lugar de dejar que reviente la lista entera.
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Cabeceras de todas las conversaciones, de la más reciente a la más antigua. */
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
 * Escritura atómica: se vuelca a `.tmp` y se renombra. Si el proceso muere a
 * mitad, el archivo anterior sigue íntegro — importa más aquí que en los
 * settings, porque esto no se puede regenerar desde defaults.
 */
export function saveConversation(conversation: Conversation): void {
  try {
    mkdirSync(dir(), { recursive: true });
    const path = fileFor(conversation.id);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(conversation, null, 2), 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    // Que falle el guardado no puede tumbar una entrevista en curso.
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

/** Borra el historial entero. Sólo lo llama el botón del dashboard. */
export function clearHistory(): void {
  try {
    rmSync(dir(), { recursive: true, force: true });
  } catch (err) {
    console.error('[history] no se pudo borrar el historial:', err);
  }
}

/** Dónde vive el historial. El dashboard lo enseña para que no sea un misterio. */
export function historyLocation(): string {
  return dir();
}
