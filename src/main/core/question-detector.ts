/**
 * Decides whether an utterance from the other party deserves an automatic
 * answer.
 *
 * It's a ladder of increasing cost, and the order matters: the local heuristic
 * is free and discards the vast majority of segments, so only what passes that
 * filter can ever cost tokens.
 *
 * We optimize for precision, not recall: a suggestion that appears when no one
 * asked anything distracts at the worst possible moment. If the detector misses
 * a case, the user still has the manual hotkey.
 */

import type { AutoTriggerSensitivity } from '@shared/types';

/** Question markers in Spanish and English, at the start of the sentence. */
const INTERROGATIVE_OPENERS = [
  // Spanish
  'que', 'qué', 'cual', 'cuál', 'cuales', 'cuáles', 'como', 'cómo', 'cuando',
  'cuándo', 'donde', 'dónde', 'quien', 'quién', 'por que', 'por qué', 'porque',
  'para que', 'para qué', 'cuanto', 'cuánto', 'cuanta', 'cuánta', 'cuantos',
  'cuántos', 'sabes', 'puedes', 'podrias', 'podrías', 'tienes', 'has', 'habias',
  'habías', 'conoces', 'crees', 'harias', 'harías',
  // Inglés
  'what', 'which', 'how', 'when', 'where', 'who', 'whose', 'why', 'can', 'could',
  'would', 'will', 'do', 'does', 'did', 'have', 'has', 'are', 'is', 'was', 'were',
  'should', 'tell', 'walk', 'describe', 'explain', 'give', 'suppose', 'imagine',
];

/**
 * Imperative openings that are interview questions without a question mark:
 * "cuéntame sobre tu experiencia", "walk me through...".
 */
const IMPERATIVE_PROMPTS = [
  'cuentame', 'cuéntame', 'hablame', 'háblame', 'explicame', 'explícame',
  'describeme', 'descríbeme', 'dime', 'dame un ejemplo', 'ponme un ejemplo',
  'imagina', 'supon', 'supón',
  // The "-nos" forms are as imperative as the "-me" ones, and in a meeting with
  // several people they're the ones that come up. These do count in any
  // position: nobody says "explicanos" without asking for something.
  'cuentanos', 'explicanos', 'hablanos', 'describenos', 'dinos',
  'tell me', 'walk me through', 'talk me through', 'give me an example',
  'describe a time', 'explain how', 'explain why', 'take me through',
];

/**
 * Imperative verbs that open a request, **at the start only**.
 *
 * The gap they cover came from a real test: "Explica un poco el rol de un SRE"
 * was discarded, and the same question in another form —"¿Podrías explicar un
 * poco el rol de un SRE?"— fired without a problem. Both ask for exactly the
 * same thing; only one is phrased as a question, and **people use both**.
 *
 * It was also a cross-language asymmetry: in English the bare imperatives were
 * already covered —`explain`, `describe`, `tell` live in the openers list— and
 * in Spanish only the pronoun forms were recognized (`explícame`, `cuéntame`).
 * Whoever says "explica" without the "me" was asking for the same thing.
 *
 * **At the start only, and this isn't negotiable.** These verbs are identical to
 * the third person indicative, which shows up constantly mid-sentence: "el
 * informe explica que…", "él describe el problema". At the start of an
 * utterance, by contrast, it's almost always a request.
 *
 * These are left out on purpose, not by oversight:
 *
 * | Verb | Why not |
 * |---|---|
 * | `cuenta` | It's also a noun, and "cuenta con" means something else |
 * | `indica` | "indica que…" in the third person is the norm, not the exception |
 * | `desarrolla` | "desarrolla software" opens a perfectly declarative sentence |
 * | `habla` | "habla muy rápido" describes someone, it asks for nothing |
 *
 * They go without accents because they're compared against the already
 * normalized text.
 */
const IMPERATIVE_OPENERS = [
  'explica', 'describe', 'define', 'compara', 'enumera', 'resume', 'detalla',
  'profundiza', 'amplia', 'aclara', 'ejemplifica', 'justifica', 'argumenta',
  'ilustra', 'menciona',
];

/** Sentences that are too short are almost never real questions worth answering. */
const MIN_WORDS = 3;

/**
 * Minimum when there's an unambiguous question signal.
 *
 * In Spanish many complete questions are two words: "¿Podrías presentarte?",
 * "¿Qué recomiendas?", "¿Cómo funciona?". With the minimum fixed at three they
 * were discarded silently — it really happened, and from the outside it looked
 * like the app had stopped responding. It's lowered only when there's a question
 * mark or a leading question word, so as not to open the door to stray
 * confirmations like "vale ya".
 */
const MIN_WORDS_WITH_MARKER = 2;

/**
 * Fillers and confirmations that the heuristic would flag for starting with a
 * question word but that don't ask for an answer.
 */
const FILLERS = [
  'que tal', 'qué tal', 'como estas', 'cómo estás', 'como va', 'cómo va',
  'me escuchas', 'me oyes', 'se me escucha', 'puedes oirme', 'puedes oírme',
  // Audio-check variants that were missing. They came from a real test: "me
  // puedes escuchar" wasn't there and no other rule caught it.
  'me puedes escuchar', 'puedes escucharme', 'me escuchan', 'se escucha',
  'me oyen', 'probando',
  'hola buenos dias', 'hola buenas', 'buenos dias', 'buenas tardes',
  'how are you', 'can you hear me', 'do you hear me', 'are you there',
  'is that ok', 'does that make sense', 'you know', 'right',
];

/**
 * Interrogativos ACENTUADOS, buscados en el texto crudo y en cualquier posición.
 *
 * En español el acento es lo único que separa "qué" de "que", y `normalize()`
 * lo tira para poder comparar de forma estable — con lo que la señal más fuerte
 * del idioma se perdía antes de mirarla. Por eso esta comprobación va aparte y
 * sobre el original.
 *
 * Buscar en cualquier posición importa: "si quiero X, **qué** lenguaje debería
 * usar" es una pregunta de manual y las reglas de apertura no la ven, porque
 * sólo miran las dos primeras palabras.
 *
 * `\p{L}` con la bandera `u` en lugar de `\b`: `\b` es ASCII, así que en "qué"
 * vería un límite de palabra entre la "u" y la "é" y la regla no funcionaría.
 */
const ACCENTED_INTERROGATIVE =
  /(^|[^\p{L}])(qué|cuál|cuáles|cómo|cuándo|dónde|quién|quiénes|cuánto|cuánta|cuántos|cuántas)([^\p{L}]|$)/u;

/**
 * Formulas that ask for judgment, in any position.
 *
 * An ASR doesn't punctuate reliably, so many questions arrive as statements.
 * These constructions ask for an answer even when the text ends in a period.
 *
 * **There is NO variant of "debería" here**, and it's not an oversight. They
 * were tried (`que deberia`, `deberia usar`, …) and fired on normal subordinate
 * clauses: "creo que debería haber estudiado más" isn't a question. What
 * distinguishes "¿qué lenguaje debería usar?" from that sentence isn't the verb,
 * it's the question word — and `ACCENTED_INTERROGATIVE` already handles that.
 * The false-positive test in `question-detector.test.ts` pins this decision.
 */
const EMBEDDED_MARKERS = [
  'me recomiendas', 'que recomiendas', 'recomendarias', 'me aconsejas',
  'que sugieres', 'que opinas', 'que piensas', 'que harias',
  'cual es mejor', 'cual seria', 'que diferencia hay', 'cual es la diferencia',
  'me puedes explicar', 'puedes explicarme', 'como puedo', 'como se hace',
  'que tan',
  'what would you', 'which one should', 'how would you', 'what do you think',
];

/** Strips accents and punctuation to compare in a stable way. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Greetings that almost always sit right in front of an audio check. */
const GREETINGS = ['hola', 'hey', 'oye', 'buenas', 'buenos dias', 'buenas tardes', 'hi', 'hello'];

/**
 * `true` if the WHOLE utterance is a greeting and audio check.
 *
 * The previous rule discarded any sentence that **started** with a filler, and
 * that killed real questions: in a real session "¿Qué tal es la idea de
 * software?" was discarded because it starts with "qué tal". A filler has to be
 * the whole sentence, not its first half.
 *
 * It's split into clauses because in practice they're said chained —"Hola,
 * ¿cómo estás? ¿Me escuchas?"— and it's only discarded if **all** the parts are
 * a greeting or check. It's enough for one not to be for it to be worth looking
 * at.
 */
function isAllFiller(raw: string): boolean {
  const clauses = raw
    .split(/[?¿!¡.,;]+/)
    .map((clause) => normalize(clause))
    .filter(Boolean);

  if (clauses.length === 0) return false;
  return clauses.every(
    (clause) => GREETINGS.includes(clause) || FILLERS.includes(clause)
  );
}

export interface QuestionVerdict {
  isQuestion: boolean;
  /** Why it was decided this way. Logged so the heuristic can be tuned. */
  reason: string;
  /**
   * `true` if the discard is a **doubt**, not a certainty.
   *
   * The second step looks at it to decide whether it's worth spending a query
   * asking the model. A filler or a two-word phrase is discarded with certainty;
   * a long sentence with no marker can perfectly well be a question said in the
   * form of a statement, and a word list can't know that.
   *
   * It's a field and not a comparison of the `reason` text on purpose: that text
   * is written for a person to read, and tying logic to it turns it into an API
   * that breaks when a message is reworded. It's the same reason provider errors
   * are told apart by class and not by string.
   */
  ambiguous?: boolean;
}

/**
 * Local heuristic, zero cost.
 *
 * It doesn't require a question mark because many STT engines don't add one
 * reliably — relying on it would lose most of the questions.
 */
export function looksLikeQuestion(
  text: string,
  sensitivity: AutoTriggerSensitivity = 'balanced'
): QuestionVerdict {
  const raw = text.trim();
  if (!raw) return { isQuestion: false, reason: 'vacío' };

  const normalized = normalize(raw);
  const words = normalized.split(' ').filter(Boolean);

  // Fillers are checked before everything else: "¿cómo estás?" has a question
  // mark and starts with a question word, and still isn't answered.
  if (isAllFiller(raw)) {
    return { isQuestion: false, reason: 'muletilla o comprobación de audio' };
  }

  const firstWord = words[0] ?? '';
  const hasStrongMarker =
    raw.includes('?') ||
    INTERROGATIVE_OPENERS.includes(firstWord) ||
    IMPERATIVE_OPENERS.includes(firstWord) ||
    IMPERATIVE_PROMPTS.some((prompt) => normalized.startsWith(prompt));

  const minWords = hasStrongMarker ? MIN_WORDS_WITH_MARKER : MIN_WORDS;
  if (words.length < minWords) {
    return { isQuestion: false, reason: `demasiado corto (${words.length} palabras)` };
  }

  // Past the filler and length filters, in `all` there's nothing left to
  // decide: if you're dictating the questions, there's no noise to protect from.
  if (sensitivity === 'all') {
    return { isQuestion: true, reason: 'sensibilidad "todo"' };
  }

  for (const prompt of IMPERATIVE_PROMPTS) {
    if (normalized.startsWith(prompt)) {
      return { isQuestion: true, reason: `apertura imperativa: "${prompt}"` };
    }
  }

  /*
   * The bare imperative verb: "explica el rol de un SRE".
   *
   * It goes up here, with the other strong signals, and not down with the
   * `balanced` rules: asking for something is as explicit as questioning it, so
   * strict mode has to see it too. The request lacking a question mark doesn't
   * make it doubtful.
   */
  if (IMPERATIVE_OPENERS.includes(firstWord)) {
    return { isQuestion: true, reason: `verbo en imperativo: "${firstWord}"` };
  }

  // The explicit question mark is a strong signal when the engine adds it.
  if (raw.includes('?')) {
    return { isQuestion: true, reason: 'signo de interrogación' };
  }

  const firstTwo = words.slice(0, 2).join(' ');
  if (INTERROGATIVE_OPENERS.includes(firstWord) || INTERROGATIVE_OPENERS.includes(firstTwo)) {
    return { isQuestion: true, reason: `interrogativo inicial: "${firstWord}"` };
  }

  // From here on, only in `balanced`. These are the rules that recover the
  // questions the ASR delivers without marks, at the cost of some extra firing.
  if (sensitivity === 'strict') {
    return {
      isQuestion: false,
      reason: 'sin marcadores de pregunta (modo estricto)',
      // Ambiguous anyway: `strict` decides how much the heuristic gambles, not
      // whether the model gets a say. Strict + classifier is in fact the most
      // precise combination there is — no guessing by words, and the model
      // resolving the doubts.
      ambiguous: true,
    };
  }

  // On the RAW text: the accent survives here and not in `normalized`.
  const accented = ACCENTED_INTERROGATIVE.exec(raw.toLowerCase());
  if (accented) {
    return { isQuestion: true, reason: `interrogativo acentuado: "${accented[2]}"` };
  }

  /*
   * Imperative openings in ANY position, not just at the start.
   *
   * When the fragments of a hesitant utterance are joined, the imperative stops
   * leading the sentence: "Bueno... a ver, cuéntame sobre tu experiencia" is a
   * textbook request and the prefix check didn't see it. Asking for something is
   * still asking for something even with a hesitation in front.
   */
  for (const prompt of IMPERATIVE_PROMPTS) {
    if (new RegExp(`(^|[^\\p{L}])${prompt}([^\\p{L}]|$)`, 'u').test(normalized)) {
      return { isQuestion: true, reason: `petición: "${prompt}"` };
    }
  }

  for (const marker of EMBEDDED_MARKERS) {
    if (normalized.includes(marker)) {
      return { isQuestion: true, reason: `fórmula de consulta: "${marker}"` };
    }
  }

  /*
   * This is where the ceiling of this heuristic dies, and that's why it's
   * marked as a doubt instead of a discard.
   *
   * "Una persona que conozca de DevOps debería conocer también de seguridad"
   * reaches here, and it's a question: whoever says it expects an answer. What
   * makes it a question isn't in the lexicon —it's that it's a statement aimed
   * at someone— so no list will ever catch it.
   */
  return { isQuestion: false, reason: 'sin marcadores de pregunta', ambiguous: true };
}
