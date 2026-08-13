import type { Settings } from '@shared/types';
import { createLLMProvider } from '../llm';
import type { QuestionVerdict } from './question-detector';

/**
 * The auto-trigger's second step: ask the model.
 *
 * `question-detector.ts` is a keyword heuristic and has a ceiling that no
 * amount of extra lists can raise. The case that exposed it, taken from a real
 * conversation:
 *
 *   "Una persona que conozca de DevOps debería conocer también de seguridad."
 *   "Si una persona sabe DevOps, necesariamente tendría que saber de seguridad."
 *
 * Both are **questions** said out loud —whoever says them expects an answer—
 * and both arrive from the recognizer as declarative sentences, with no mark and
 * no question word. No marker list will catch them, because what makes them
 * questions isn't in the lexicon: it's that they're statements aimed at someone
 * who expects an answer. And adding "should" to the heuristic was tried and
 * dropped — it fires on "I think I should have studied more", which asks for
 * nothing.
 *
 * That's what a model can read, and it's the step `AutoTriggerMode` had promised
 * from the start in the type without the code existing.
 *
 * ## The three rules that make it viable
 *
 * - **The model is only asked about what the heuristic couldn't decide.** A
 *   filler or a two-word phrase is discarded for free, as always. Paying for a
 *   call over an "okay, great" would be absurd.
 * - **It never blocks.** With its own clock and `AbortSignal`: if the model is
 *   slow or fails, the answer is "it wasn't a question" and the app carries on
 *   as before. A downed classifier can't leave listening hung.
 * - **It costs money, and it's said.** It's one extra query per ambiguous
 *   utterance, and on a reasoning model it's not even a cheap query. That's why
 *   it isn't the default and the dashboard warns about it.
 */

/**
 * Wait cap.
 *
 * Eight seconds is a lot for a yes/no, and it's on purpose: the bar is set by a
 * local model on a modest machine, which is exactly where this mode makes the
 * most sense because the query costs no money. Past that, the utterance is
 * already water under the bridge in a live conversation and answering late is
 * worse than not answering.
 */
const CLASSIFY_TIMEOUT_MS = 8_000;

/**
 * Output budget.
 *
 * The useful answer is one word, but the cap can't be one word: reasoning
 * models count the thinking inside this same number and would end up writing
 * nothing — the trap already documented three times in this project. Each
 * provider adds on its own whatever it needs to reason (`budgetFor`), so here
 * it's enough to leave room for the word.
 */
const CLASSIFY_MAX_TOKENS = 16;

const SYSTEM_PROMPT = `
Eres un clasificador binario dentro de un asistente que escucha una conversación
en directo. Decides una sola cosa: si la última intervención espera que la
persona asistida responda algo.

Responde EXCLUSIVAMENTE con una palabra: SI o NO. Sin puntuación, sin
explicación, sin ninguna otra palabra.

Responde SI cuando la intervención:
- Es una pregunta, aunque llegue sin signos de interrogación.
- Es una afirmación lanzada para que la otra persona opine, la confirme o la
  rebata. Ejemplo: "una persona que sepa DevOps tendría que saber de seguridad".
- Pide algo: una explicación, un ejemplo, una opinión, un caso concreto.

Responde NO cuando la intervención:
- Es un comentario que no espera nada: relleno, pensar en voz alta, una
  confirmación de audio, un saludo.
- Es la propia persona asistida narrando o leyendo algo sin dirigirse a nadie.
- Está tan cortada o es tan corta que no se puede saber qué pide.

Ante la duda real, responde NO: una sugerencia que aparece cuando nadie ha
preguntado nada interrumpe en el peor momento.
`.trim();

/**
 * `true` if the utterance asks for an answer.
 *
 * It never throws. Any failure —no credential, downed model, timed out— resolves
 * as `false`, which is the verdict the heuristic already had: the mode degrades
 * to `heuristic` instead of breaking.
 */
export async function classifyQuestion(
  text: string,
  settings: Settings
): Promise<{ isQuestion: boolean; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

  try {
    const provider = createLLMProvider(settings);

    let answer = '';
    for await (const chunk of provider.streamAnswer(
      {
        systemPrompt: SYSTEM_PROMPT,
        // The transcript is empty on purpose: what's classified is THIS
        // utterance, and giving it the whole conversation invites answering
        // by the context instead of by what was just said.
        transcript: '',
        question: text,
        maxTokens: CLASSIFY_MAX_TOKENS,
      },
      controller.signal
    )) {
      answer += chunk;
      // With the first word it's already decided; reading on would be waiting
      // for tokens that won't be looked at.
      if (answer.trim().length >= 2) break;
    }

    const verdict = answer.trim().toUpperCase();
    /*
     * SI is accepted and so is YES: the prompt is in Spanish and the models
     * answer in the conversation's language more often than one expects — it's
     * the same surprise that already forced a language rule into every profile.
     */
    const isQuestion = verdict.startsWith('SI') || verdict.startsWith('SÍ') || verdict.startsWith('YES');

    return {
      isQuestion,
      reason: isQuestion ? 'el clasificador dice que pide respuesta' : 'el clasificador dice que no',
    };
  } catch (err) {
    if (controller.signal.aborted) {
      console.warn('[auto] el clasificador no contestó a tiempo; se descarta la intervención.');
      return { isQuestion: false, reason: 'el clasificador no contestó a tiempo' };
    }
    console.warn(
      `[auto] el clasificador falló: ${err instanceof Error ? err.message : String(err)}`
    );
    return { isQuestion: false, reason: 'el clasificador falló' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether it's worth spending a query on this utterance.
 *
 * Only what the heuristic marked as **doubt** is escalated. A discard by filler
 * or by length is a certainty: asking the model whether "okay, great" is a
 * question costs the same as asking it something useful, and the answer is
 * already known.
 *
 * It reads a field of the verdict and not the `reason` text, which is written
 * for a person to read. The first version compared the string prefix and a test
 * caught it right away: the strict-mode reason starts the same way, so the
 * decision depended on how a message happened to be worded.
 */
export function worthClassifying(verdict: QuestionVerdict): boolean {
  return verdict.ambiguous === true;
}
