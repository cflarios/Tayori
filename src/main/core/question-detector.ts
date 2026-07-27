/**
 * Decide si una intervención del interlocutor merece una respuesta automática.
 *
 * Es una escalera de coste creciente, y el orden importa: la heurística local es
 * gratis y descarta la gran mayoría de los segmentos, así que sólo lo que pasa
 * ese filtro puede llegar a costar tokens.
 *
 * Optimizamos para precisión, no para recall: una sugerencia que aparece cuando
 * nadie preguntó nada distrae en el peor momento posible. Si el detector falla
 * un caso, el usuario todavía tiene el hotkey manual.
 */

import type { AutoTriggerSensitivity } from '@shared/types';

/** Marcadores de pregunta en español e inglés, al principio de la frase. */
const INTERROGATIVE_OPENERS = [
  // Español
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
 * Aperturas imperativas que son preguntas de entrevista sin signo de
 * interrogación: "cuéntame sobre tu experiencia", "walk me through...".
 */
const IMPERATIVE_PROMPTS = [
  'cuentame', 'cuéntame', 'hablame', 'háblame', 'explicame', 'explícame',
  'describeme', 'descríbeme', 'dime', 'dame un ejemplo', 'ponme un ejemplo',
  'imagina', 'supon', 'supón',
  'tell me', 'walk me through', 'talk me through', 'give me an example',
  'describe a time', 'explain how', 'explain why', 'take me through',
];

/** Frases demasiado cortas casi nunca son preguntas reales que valga responder. */
const MIN_WORDS = 3;

/**
 * Muletillas y confirmaciones que la heurística marcaría por empezar con un
 * interrogativo pero que no piden respuesta.
 */
const FILLERS = [
  'que tal', 'qué tal', 'como estas', 'cómo estás', 'como va', 'cómo va',
  'me escuchas', 'me oyes', 'se me escucha', 'puedes oirme', 'puedes oírme',
  // Variantes de la comprobación de audio que faltaban. Salieron de una prueba
  // real: "me puedes escuchar" no estaba y no lo cazaba ninguna otra regla.
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
 * Fórmulas que piden criterio, en cualquier posición.
 *
 * Un ASR no puntúa de forma fiable, así que muchas preguntas llegan como
 * afirmaciones. Estas construcciones piden una respuesta aunque el texto acabe
 * en punto.
 *
 * **Aquí NO hay ninguna variante de "debería"**, y no es un olvido. Se probaron
 * (`que deberia`, `deberia usar`, …) y disparaban con subordinadas normales:
 * "creo que debería haber estudiado más" no es una pregunta. Lo que distingue
 * "¿qué lenguaje debería usar?" de esa frase no es el verbo, es el
 * interrogativo — y de eso ya se encarga `ACCENTED_INTERROGATIVE`. El test de
 * falsos positivos de `question-detector.test.ts` fija esta decisión.
 */
const EMBEDDED_MARKERS = [
  'me recomiendas', 'que recomiendas', 'recomendarias', 'me aconsejas',
  'que sugieres', 'que opinas', 'que piensas', 'que harias',
  'cual es mejor', 'cual seria', 'que diferencia hay', 'cual es la diferencia',
  'me puedes explicar', 'puedes explicarme', 'como puedo', 'como se hace',
  'que tan',
  'what would you', 'which one should', 'how would you', 'what do you think',
];

/** Quita acentos y puntuación para comparar de forma estable. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Saludos que casi siempre van pegados delante de una prueba de audio. */
const GREETINGS = ['hola', 'hey', 'oye', 'buenas', 'buenos dias', 'buenas tardes', 'hi', 'hello'];

/**
 * `true` si la intervención ENTERA es saludo y comprobación de audio.
 *
 * La regla anterior descartaba cualquier frase que **empezara** por una
 * muletilla, y eso mataba preguntas de verdad: en una sesión real se descartó
 * "¿Qué tal es la idea de software?" porque empieza por "qué tal". Una muletilla
 * tiene que ser la frase entera, no su primera mitad.
 *
 * Se parte en oraciones porque en la práctica se dicen encadenadas —"Hola,
 * ¿cómo estás? ¿Me escuchas?"— y sólo se descarta si **todas** las partes son
 * saludo o comprobación. Basta con que una no lo sea para que valga la pena
 * mirarla.
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
  /** Por qué se decidió así. Se registra para poder afinar la heurística. */
  reason: string;
}

/**
 * Heurística local, coste cero.
 *
 * No requiere signo de interrogación porque muchos motores de STT no lo ponen
 * de forma fiable — apoyarse en él perdería la mayoría de las preguntas.
 */
export function looksLikeQuestion(
  text: string,
  sensitivity: AutoTriggerSensitivity = 'balanced'
): QuestionVerdict {
  const raw = text.trim();
  if (!raw) return { isQuestion: false, reason: 'vacío' };

  const normalized = normalize(raw);
  const words = normalized.split(' ').filter(Boolean);

  // Las muletillas se comprueban antes que todo lo demás: "¿cómo estás?" tiene
  // signo de interrogación y empieza por interrogativo, y aun así no se responde.
  if (isAllFiller(raw)) {
    return { isQuestion: false, reason: 'muletilla o comprobación de audio' };
  }

  if (words.length < MIN_WORDS) {
    return { isQuestion: false, reason: `demasiado corto (${words.length} palabras)` };
  }

  // Superado el filtro de muletillas y de longitud, en `all` ya no hay nada que
  // decidir: si estás dictando tú las preguntas, no hay ruido del que protegerse.
  if (sensitivity === 'all') {
    return { isQuestion: true, reason: 'sensibilidad "todo"' };
  }

  for (const prompt of IMPERATIVE_PROMPTS) {
    if (normalized.startsWith(prompt)) {
      return { isQuestion: true, reason: `apertura imperativa: "${prompt}"` };
    }
  }

  // El signo de interrogación explícito es señal fuerte cuando el motor lo pone.
  if (raw.includes('?')) {
    return { isQuestion: true, reason: 'signo de interrogación' };
  }

  const firstWord = words[0] ?? '';
  const firstTwo = words.slice(0, 2).join(' ');
  if (INTERROGATIVE_OPENERS.includes(firstWord) || INTERROGATIVE_OPENERS.includes(firstTwo)) {
    return { isQuestion: true, reason: `interrogativo inicial: "${firstWord}"` };
  }

  // A partir de aquí, sólo en `balanced`. Son las reglas que recuperan las
  // preguntas que el ASR entrega sin signos, a cambio de algún disparo de más.
  if (sensitivity === 'strict') {
    return { isQuestion: false, reason: 'sin marcadores de pregunta (modo estricto)' };
  }

  // Sobre el texto CRUDO: el acento sobrevive aquí y no en `normalized`.
  const accented = ACCENTED_INTERROGATIVE.exec(raw.toLowerCase());
  if (accented) {
    return { isQuestion: true, reason: `interrogativo acentuado: "${accented[2]}"` };
  }

  for (const marker of EMBEDDED_MARKERS) {
    if (normalized.includes(marker)) {
      return { isQuestion: true, reason: `fórmula de consulta: "${marker}"` };
    }
  }

  return { isQuestion: false, reason: 'sin marcadores de pregunta' };
}
