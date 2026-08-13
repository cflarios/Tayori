import { fence } from '../core/untrusted';
import type { AnswerRequest } from './types';

/**
 * The user turn, the same for all five providers.
 *
 * It was copied in `claude.ts`, `gemini.ts`, `openai.ts`, `deepseek.ts` and
 * `ollama.ts`, with five near-identical versions of the same hand-built
 * `<transcripcion>`. While it was only formatting, the duplication held; since
 * that envelope became a **security boundary** it no longer holds: a defense you
 * have to remember to repeat across five files —and the sixth the day a provider
 * is added— is a defense that's going to be forgotten.
 *
 * Every envelope comes from here, and its already-dismantled content comes from
 * `core/untrusted.ts`. If someone writes `<transcripcion>` by hand again in a
 * provider, they've opened a hole.
 */
export function buildUserTurn(
  request: AnswerRequest,
  /**
   * Whether THIS provider actually sends the capture.
   *
   * It's not the same as "there is a capture": DeepSeek never sends it, and
   * announcing to the model an image it hasn't received is inviting it to invent
   * the prompt.
   */
  sendsImages: boolean
): string {
  /*
   * Interpreter: the turn goes in raw, with no envelopes or final instruction.
   * The model translates everything it receives, so with the envelopes it
   * carried the tag names translated into the output (`<transcripcion>` →
   * `<transcription>`). Only the last utterance —what needs translating— is
   * sent; the system prompt already tells it what to do, and there's no boundary
   * to defend because translating is literal by design.
   */
  if (request.interpreter) {
    return request.question || request.transcript || '';
  }

  const parts = [fence('transcripcion', request.transcript || '(sin audio aún)')];

  if (request.question) parts.push(fence('pregunta', request.question));

  if (sendsImages && request.images?.length) {
    parts.push('El usuario adjuntó una captura de su pantalla; tenla en cuenta.');
  }

  /*
   * The instruction goes last: it's the position the model attends to most
   * strongly, and it also keeps the cacheable prefix above stable.
   *
   * It goes **outside every envelope** on purpose. It's the only part of this
   * message that IS an order from us, and it's told apart from what's inside by
   * being outside.
   */
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}
