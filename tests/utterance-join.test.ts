import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from '../src/main/core/question-detector';

/**
 * The failure that motivated joining fragments.
 *
 * The VAD closes the turn after 700 ms of silence, and whoever hesitates makes
 * pauses longer than that mid-sentence. The previous version fired on the FIRST
 * fragment and silenced the following ones for 2.5 s: it answered the hesitation
 * and discarded the question.
 *
 * These cases check what really matters: that the joined text is detected as a
 * question when the loose pieces aren't.
 */
describe('fragments of a single question', () => {
  const join = (parts: string[]): string => parts.join(' ').replace(/\s+/g, ' ').trim();

  it('the lone preamble is not a question, but the whole is', () => {
    const fragmentos = ['Entonces, eh...', 'lo que quería preguntarte es', '¿cómo lo harías tú?'];

    // This is how it behaved before: the first piece was judged and answered.
    expect(looksLikeQuestion(fragmentos[0] ?? '').isQuestion).toBe(false);
    // And this is how it is now.
    expect(looksLikeQuestion(join(fragmentos)).isQuestion).toBe(true);
  });

  it('rescues the question when the hesitation goes first', () => {
    const casos = [
      ['Bueno...', 'a ver', 'cuéntame sobre tu experiencia con Kubernetes'],
      ['Mira,', 'una cosa,', '¿qué base de datos usarías para esto?'],
      ['Vale.', 'Y entonces', 'cómo manejarías un pico de tráfico'],
    ];
    for (const partes of casos) {
      expect(looksLikeQuestion(join(partes)).isQuestion).toBe(true);
    }
  });

  it("joining doesn't turn into a question what isn't one", () => {
    // The price of joining would be over-firing; these still don't fire.
    const partes = ['Bueno, pues nada.', 'Eso es todo por mi parte.', 'Gracias.'];
    expect(looksLikeQuestion(join(partes)).isQuestion).toBe(false);
  });

  it('a question that arrives whole is still detected the same', () => {
    // Joining can't worsen the simple case, which is the most common one.
    expect(looksLikeQuestion('¿Cuál es tu mayor debilidad?').isQuestion).toBe(true);
  });
});
