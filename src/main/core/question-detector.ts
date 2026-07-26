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
  'how are you', 'can you hear me', 'do you hear me', 'are you there',
  'is that ok', 'does that make sense', 'you know', 'right',
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
export function looksLikeQuestion(text: string): QuestionVerdict {
  const raw = text.trim();
  if (!raw) return { isQuestion: false, reason: 'vacío' };

  const normalized = normalize(raw);
  const words = normalized.split(' ').filter(Boolean);

  // Las muletillas se comprueban antes que todo lo demás: "¿cómo estás?" tiene
  // signo de interrogación y empieza por interrogativo, y aun así no se responde.
  if (FILLERS.some((filler) => normalized === filler || normalized.startsWith(`${filler} `))) {
    return { isQuestion: false, reason: 'muletilla o comprobación de audio' };
  }

  if (words.length < MIN_WORDS) {
    return { isQuestion: false, reason: `demasiado corto (${words.length} palabras)` };
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

  return { isQuestion: false, reason: 'sin marcadores de pregunta' };
}
