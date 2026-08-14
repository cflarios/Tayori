import { describe, expect, it } from 'vitest';
import { TranscriptBuffer } from '../src/main/core/transcript-buffer';

describe('TranscriptBuffer', () => {
  it('consolidates partials from the same speaker into a single segment', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Cuéntame', false);
    buffer.ingest('them', 'sobre tu', false);
    buffer.ingest('them', 'experiencia', true);

    // The essential thing: three partials don't produce three lines.
    expect(buffer.all()).toHaveLength(1);
    expect(buffer.all()[0]?.text).toBe('Cuéntame sobre tu experiencia');
    expect(buffer.all()[0]?.isFinal).toBe(true);
  });

  it('keeps segments separate by speaker even when they overlap', () => {
    const buffer = new TranscriptBuffer();

    // Real case: both speak at once and the partials interleave.
    buffer.ingest('them', '¿Qué es', false);
    buffer.ingest('me', 'Bueno,', false);
    buffer.ingest('them', 'un closure?', true);
    buffer.ingest('me', 'es una función', true);

    expect(buffer.all()).toHaveLength(2);
    expect(buffer.lastFrom('them')?.text).toBe('¿Qué es un closure?');
    expect(buffer.lastFrom('me')?.text).toBe('Bueno, es una función');
  });

  it('opens a new segment after finalizing the previous one', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Primera pregunta', true);
    buffer.ingest('them', 'Segunda pregunta', true);

    expect(buffer.all()).toHaveLength(2);
  });

  it('attaches the punctuation without leaving a space before it', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Hola', false);
    buffer.ingest('them', ', ¿qué tal', false);
    buffer.ingest('them', '?', true);

    expect(buffer.all()[0]?.text).toBe('Hola, ¿qué tal?');
  });

  it('respects the spaces the fragment already brings without duplicating them', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'uno', false);
    buffer.ingest('them', ' dos', false);
    buffer.ingest('them', ' tres', true);

    expect(buffer.all()[0]?.text).toBe('uno dos tres');
  });

  it('finalizeOpen closes a segment the engine left open', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'frase sin cerrar', false);
    expect(buffer.all()[0]?.isFinal).toBe(false);

    const closed = buffer.finalizeOpen('them');

    expect(closed?.isFinal).toBe(true);
    expect(closed?.endedAt).toBeTypeOf('number');
    // And a later ingest must start a new segment, not reopen the old one.
    buffer.ingest('them', 'frase nueva', true);
    expect(buffer.all()).toHaveLength(2);
  });

  it("finalizeOpen doesn't fail if there's nothing open", () => {
    const buffer = new TranscriptBuffer();
    expect(buffer.finalizeOpen('me')).toBeNull();
  });

  it('trims to maxSegments discarding the oldest', () => {
    const buffer = new TranscriptBuffer(3);

    for (let i = 1; i <= 5; i++) buffer.ingest('them', `frase ${i}`, true);

    expect(buffer.all()).toHaveLength(3);
    expect(buffer.all()[0]?.text).toBe('frase 3');
    expect(buffer.all()[2]?.text).toBe('frase 5');
  });

  it("doesn't keep writing to an open segment that was already trimmed", () => {
    const buffer = new TranscriptBuffer(2);

    // 'me' stays open and is then displaced by newer segments.
    buffer.ingest('me', 'viejo abierto', false);
    buffer.ingest('them', 'uno', true);
    buffer.ingest('them', 'dos', true);

    // The 'me' segment has already left the buffer; an ingest must create a new
    // one instead of mutating the orphaned object.
    buffer.ingest('me', 'nuevo', true);

    expect(buffer.lastFrom('me')?.text).toBe('nuevo');
  });

  it('formats with explicit role labels and omits the empty ones', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', '¿Por qué este puesto?', true);
    buffer.ingest('me', '   ', true);
    buffer.ingest('me', 'Por el equipo', true);

    expect(buffer.format()).toBe('ENTREVISTADOR: ¿Por qué este puesto?\nYO: Por el equipo');
  });

  it('recent filters by age', () => {
    const buffer = new TranscriptBuffer();

    const old = buffer.ingest('them', 'antiguo', true);
    old.startedAt = Date.now() - 60_000;
    buffer.ingest('them', 'reciente', true);

    const recent = buffer.recent(30);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.text).toBe('reciente');
  });
});

/**
 * Cumulative partials, which are OpenAI's real-time API's.
 *
 * The bug this pins was seen on screen: the sentence came out **twice**, and the
 * first copy with the words split ("conoz ca", "ingen ieros"). The cause was
 * treating as incremental a `completed` that brings the whole turn, so the buffer
 * concatenated it behind the partials it had already accumulated.
 */
describe('cumulative partials', () => {
  it('the cumulative text REPLACES instead of concatenating', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Una persona que', false, true);
    buffer.ingest('them', 'Una persona que sepa DevOps', false, true);
    const final = buffer.ingest('them', 'Una persona que sepa DevOps.', true, true);

    expect(final.text).toBe('Una persona que sepa DevOps.');
  });

  it('without the flag it keeps concatenating, which is what Gemini needs', () => {
    // The two behaviors coexist because the engines genuinely differ: removing
    // the incremental one would break Gemini Live.
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Una persona', false);
    const final = buffer.ingest('them', 'que sepa DevOps', true);

    expect(final.text).toBe('Una persona que sepa DevOps');
  });

  it("a cumulative one doesn't carry the previous turn", () => {
    // Each turn opens its own segment: if the replacement skipped the close, the
    // second sentence would clobber the first instead of adding to it.
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'primera frase', true, true);
    buffer.ingest('them', 'segunda frase', true, true);

    expect(buffer.all().map((s) => s.text)).toEqual(['primera frase', 'segunda frase']);
  });
});
