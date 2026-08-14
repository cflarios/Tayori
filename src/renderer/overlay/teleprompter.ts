import { parseAnswerBlocks } from '@shared/answer-format';

/**
 * Splits an answer into lines you can say in one breath.
 *
 * ## What problem it solves, which isn't the one it seems
 *
 * What gives away that someone is reading **isn't the font size**: it's the
 * horizontal movement of the eyes. Sweeping a long line left to right and
 * returning to the start of the next one is visible from the other side of a
 * video call, and very much so. That's why putting the answer "big" makes the
 * problem worse instead of fixing it: a bullet in big type is wider.
 *
 * The solution of any real teleprompter is the opposite: **narrow column and one
 * sentence per line**, so the eyes barely move and the active line is always at
 * the same height. That's what this function does.
 *
 * ## Where it breaks
 *
 * Where a person would breathe, in this order: end of sentence, then a strong
 * pause (`;` `:` em dash), then a comma, and only as a last resort by words.
 * Breaking by character count alone splits phrases —"la base de / datos"— and
 * that forces reading both lines before saying anything, which is exactly the
 * hesitation to avoid.
 */

/**
 * Target width of a line, in characters.
 *
 * Around 42 is what fits in a column you can take in **without moving your
 * eyes**, at the size read out of the corner of the eye. Wider and the
 * horizontal sweep returns; narrower and you have to advance so often that the
 * line-change gesture becomes the giveaway.
 */
export const TARGET_CHARS = 42;

/** Hard cap. Above it, it breaks even if there's no nice spot. */
const MAX_CHARS = 58;

/** Less than this doesn't deserve its own line: it's glued to the previous one. */
const MIN_CHARS = 14;

/** Removes what's visual marking and isn't read out loud. */
function readable(text: string): string {
  return (
    text
      // Bullets and numbering at the start of a line: they're seen, not said.
      .replace(/^[\s]*[-*•·]\s+/gm, '')
      .replace(/^[\s]*\d+[.)]\s+/gm, '')
      // Bold and inline code: the asterisks and backticks aren't read.
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim()
  );
}

/**
 * The space closest to the target width.
 *
 * It's searched **near `TARGET_CHARS` and not at the end of the cap**: taking the
 * last space that fits leaves the next line on a stray word —"no / vuelva."— and
 * a seven-character line in the center of the screen is an advance gesture that
 * buys nothing.
 */
function spaceNearTarget(piece: string): number {
  let best = -1;
  for (let i = MIN_CHARS; i < Math.min(piece.length, MAX_CHARS); i++) {
    if (piece[i] !== ' ') continue;
    if (best === -1 || Math.abs(i - TARGET_CHARS) < Math.abs(best - TARGET_CHARS)) best = i;
  }
  return best;
}

/**
 * Breaks at the best available spot.
 *
 * It tries to split anything over the target width, not just what's over the
 * hard cap: the cap is the limit of the tolerable, and a line you always reach
 * isn't a target, it's a ceiling.
 */
function splitLong(piece: string): string[] {
  if (piece.length <= TARGET_CHARS) return [piece];

  const window = piece.slice(0, MAX_CHARS);
  const pause = Math.max(
    window.lastIndexOf('; '),
    window.lastIndexOf(': '),
    window.lastIndexOf(' — '),
    window.lastIndexOf(' - ')
  );
  const comma = window.lastIndexOf(', ');

  // Where a person would breathe, from strongest to weakest.
  const cut =
    pause >= MIN_CHARS ? pause + 1 : comma >= MIN_CHARS ? comma + 1 : spaceNearTarget(piece);

  // With no decent spot: it's left whole if tolerable, and only if it's over the
  // cap does it break by force.
  if (cut <= MIN_CHARS || cut >= piece.length) {
    if (piece.length <= MAX_CHARS) return [piece];
    return [piece.slice(0, MAX_CHARS).trim(), ...splitLong(piece.slice(MAX_CHARS).trim())];
  }

  const head = piece.slice(0, cut).trim();
  const tail = piece.slice(cut).trim();
  return tail ? [head, ...splitLong(tail)] : [head];
}

/**
 * The lines of an answer, in order.
 *
 * **Code blocks don't go in.** Nobody reads an algorithm out loud in an
 * interview: it's copied and commented on. Putting them here would fill the
 * teleprompter with lines that can't be said and that push out the ones that can.
 */
export function toLines(text: string): string[] {
  const prose = parseAnswerBlocks(text)
    .filter((block) => block.type !== 'code')
    .map((block) => block.content)
    .join('\n');

  const lines: string[] = [];

  for (const paragraph of readable(prose).split(/\n+/)) {
    const clean = paragraph.trim();
    if (!clean) continue;

    /*
     * Where this bullet starts within `lines`.
     *
     * It marks the limit of what can be merged: the jump from one bullet to the
     * next is a real pause —they're two ideas— and gluing them because the first
     * is short joins two things said separately into one line.
     */
    const startedAt = lines.length;

    // It breaks AFTER the mark, not before: the period belongs to the sentence
    // that ends, and seeing it is what says you can breathe there.
    for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
      for (const piece of splitLong(sentence.trim())) {
        const last = lines[lines.length - 1];
        /*
         * It checks whether the PREVIOUS line is a stub, not whether the new one
         * is.
         *
         * "Sí." alone, in the center of the screen, is a line that says nothing
         * and an advance gesture that is visible; the next thing is glued to it.
         * The other way around —gluing every short tail to the line before—
         * undid the cut just made at a comma, and brought the long line back.
         */
        if (
          last &&
          lines.length > startedAt &&
          last.length < MIN_CHARS &&
          last.length + piece.length + 1 <= MAX_CHARS
        ) {
          lines[lines.length - 1] = `${last} ${piece}`;
        } else if (piece) {
          lines.push(piece);
        }
      }
    }
  }

  return lines;
}
