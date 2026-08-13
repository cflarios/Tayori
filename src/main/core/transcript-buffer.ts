import { randomUUID } from 'node:crypto';
import type { Speaker, TranscriptSegment } from '@shared/types';

/**
 * Rolling window of the conversation.
 *
 * STT engines emit partial results that get revised before they close. The
 * buffer consolidates them: while a speaker has an open segment, each partial
 * REPLACES the text instead of adding a new line. Without this the transcript
 * would fill with intermediate versions of the same sentence and the context we
 * send the LLM would be repeated garbage.
 */
export class TranscriptBuffer {
  private segments: TranscriptSegment[] = [];
  /** Open segment per speaker (not yet finalized). */
  private open = new Map<Speaker, TranscriptSegment>();

  constructor(private maxSegments = 40) {}

  /**
   * Takes in an STT result and returns the resulting segment, which is what
   * gets broadcast to the overlay.
   *
   * Providers differ on whether partials are cumulative (the whole text so far)
   * or incremental (only what's new). Gemini Live sends incremental fragments,
   * so we concatenate.
   */
  ingest(
    speaker: Speaker,
    text: string,
    isFinal: boolean,
    /**
     * `true` if `text` is already the whole turn. See
     * `TranscriptEvent.cumulative`: concatenating it would write the sentence
     * twice, a bug that showed on screen with OpenAI's real-time API.
     */
    cumulative = false
  ): TranscriptSegment {
    const now = Date.now();
    const existing = this.open.get(speaker);

    if (existing) {
      existing.text = cumulative ? text.trim() : joinFragments(existing.text, text);
      existing.isFinal = isFinal;
      if (isFinal) {
        existing.endedAt = now;
        this.open.delete(speaker);
      }
      return existing;
    }

    const segment: TranscriptSegment = {
      id: randomUUID(),
      speaker,
      text: text.trimStart(),
      isFinal,
      startedAt: now,
      ...(isFinal ? { endedAt: now } : {}),
    };

    if (!isFinal) this.open.set(speaker, segment);
    this.segments.push(segment);
    this.trim();
    return segment;
  }

  /**
   * Force-closes a speaker's open segment.
   *
   * Needed because some engines never mark `finished` if the speaker just goes
   * quiet: without this the segment would stay open forever and the question
   * detector would never fire.
   */
  finalizeOpen(speaker: Speaker): TranscriptSegment | null {
    const segment = this.open.get(speaker);
    if (!segment) return null;
    segment.isFinal = true;
    segment.endedAt = Date.now();
    this.open.delete(speaker);
    return segment;
  }

  private trim(): void {
    if (this.segments.length <= this.maxSegments) return;
    const removed = this.segments.splice(0, this.segments.length - this.maxSegments);
    // If a segment that was still open gets discarded, the reference has to be
    // released or `ingest` would keep writing to an already-forgotten object.
    for (const segment of removed) {
      const open = this.open.get(segment.speaker);
      if (open && open.id === segment.id) this.open.delete(segment.speaker);
    }
  }

  /** All segments, oldest to newest. */
  all(): readonly TranscriptSegment[] {
    return this.segments;
  }

  /** Segments that started within the last `seconds`. */
  recent(seconds: number): TranscriptSegment[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.segments.filter((s) => s.startedAt >= cutoff);
  }

  /**
   * Transcript formatted for injecting into the LLM prompt.
   * The tags are explicit because the model needs to know who to answer:
   * confusing the roles produces useless answers.
   */
  format(segments: readonly TranscriptSegment[] = this.segments): string {
    return segments
      .filter((s) => s.text.trim().length > 0)
      .map((s) => `${s.speaker === 'me' ? 'YO' : 'ENTREVISTADOR'}: ${s.text.trim()}`)
      .join('\n');
  }

  /** The other party's last closed utterance: the question to answer. */
  lastFrom(speaker: Speaker): TranscriptSegment | null {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i];
      if (segment && segment.speaker === speaker && segment.text.trim()) return segment;
    }
    return null;
  }

  clear(): void {
    this.segments = [];
    this.open.clear();
  }
}

/**
 * Joins two transcript fragments while respecting the spaces.
 *
 * The engines send chunks that sometimes already carry a leading space and
 * sometimes don't, and also punctuation that should stick to the previous word.
 * Without this normalization the text comes out with double spaces or run-on
 * words.
 */
function joinFragments(left: string, right: string): string {
  if (!left) return right.trimStart();
  if (!right) return left;

  const endsWithSpace = /\s$/.test(left);
  const startsWithSpace = /^\s/.test(right);
  const startsWithPunctuation = /^[.,;:!?)\]}»…]/.test(right.trimStart());

  if (endsWithSpace || startsWithSpace || startsWithPunctuation) {
    return startsWithPunctuation ? left.trimEnd() + right.trimStart() : left + right;
  }
  return `${left} ${right.trimStart()}`;
}
