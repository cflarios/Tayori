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
  // Las formas con "-nos" son tan imperativas como las de "-me", y en una
  // reunión con varias personas son las que salen. Éstas sí valen en cualquier
  // posición: nadie dice "explicanos" sin estar pidiendo algo.
  'cuentanos', 'explicanos', 'hablanos', 'describenos', 'dinos',
  'tell me', 'walk me through', 'talk me through', 'give me an example',
  'describe a time', 'explain how', 'explain why', 'take me through',
];

/**
 * Verbos en imperativo que abren una petición, **sólo al principio**.
 *
 * El hueco que tapan salió de una prueba real: «Explica un poco el rol de un
 * SRE» se descartó, y la misma pregunta con otra forma —«¿Podrías explicar un
 * poco el rol de un SRE?»— disparó sin problema. Las dos piden exactamente lo
 * mismo; sólo una está formulada como pregunta, y **la gente usa las dos**.
 *
 * Era además una asimetría entre idiomas: en inglés los imperativos pelados ya
 * estaban cubiertos —`explain`, `describe`, `tell` viven en la lista de
 * aperturas— y en español sólo se reconocían las formas con pronombre
 * (`explícame`, `cuéntame`). Quien dice «explica» sin el «me» pedía lo mismo.
 *
 * **Sólo al principio, y esto no es negociable.** Estos verbos son idénticos a
 * la tercera persona del indicativo, que aparece a todas horas en mitad de una
 * frase: «el informe explica que…», «él describe el problema». Al principio de
 * una intervención, en cambio, es una petición casi siempre.
 *
 * Se quedan fuera a propósito, y no por olvido:
 *
 * | Verbo | Por qué no |
 * |---|---|
 * | `cuenta` | Es también sustantivo, y «cuenta con» significa otra cosa |
 * | `indica` | «indica que…» en tercera persona es lo normal, no la excepción |
 * | `desarrolla` | «desarrolla software» abre una frase perfectamente afirmativa |
 * | `habla` | «habla muy rápido» describe a alguien, no pide nada |
 *
 * Van sin acentos porque se comparan contra el texto ya normalizado.
 */
const IMPERATIVE_OPENERS = [
  'explica', 'describe', 'define', 'compara', 'enumera', 'resume', 'detalla',
  'profundiza', 'amplia', 'aclara', 'ejemplifica', 'justifica', 'argumenta',
  'ilustra', 'menciona',
];

/** Frases demasiado cortas casi nunca son preguntas reales que valga responder. */
const MIN_WORDS = 3;

/**
 * Mínimo cuando hay una señal inequívoca de pregunta.
 *
 * En español muchas preguntas completas son de dos palabras: "¿Podrías
 * presentarte?", "¿Qué recomiendas?", "¿Cómo funciona?". Con el mínimo fijo en
 * tres se descartaban en silencio — pasó de verdad, y desde fuera parecía que
 * la app había dejado de responder. Se baja sólo cuando hay signo de
 * interrogación o interrogativo inicial, para no abrir la puerta a
 * confirmaciones sueltas como "vale ya".
 */
const MIN_WORDS_WITH_MARKER = 2;

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
  /**
   * `true` si el descarte es una **duda**, no una certeza.
   *
   * Lo mira el segundo escalón para decidir si vale la pena gastar una consulta
   * preguntándole al modelo. Una muletilla o una frase de dos palabras se
   * descartan con certeza; una oración larga sin ningún marcador puede ser
   * perfectamente una pregunta dicha en forma de afirmación, y eso una lista de
   * palabras no lo puede saber.
   *
   * Es un campo y no una comparación del texto de `reason` a propósito: ese
   * texto está escrito para que lo lea una persona, y atarle lógica lo convierte
   * en una API que se rompe al reescribir un mensaje. Es la misma razón por la
   * que los errores de los proveedores se distinguen por clase y no por cadena.
   */
  ambiguous?: boolean;
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

  /*
   * El verbo en imperativo pelado: "explica el rol de un SRE".
   *
   * Va aquí arriba, con las demás señales fuertes, y no abajo con las reglas de
   * `balanced`: pedir algo es igual de explícito que preguntarlo, así que el
   * modo estricto también tiene que verlo. Que la petición no lleve signo de
   * interrogación no la vuelve dudosa.
   */
  if (IMPERATIVE_OPENERS.includes(firstWord)) {
    return { isQuestion: true, reason: `verbo en imperativo: "${firstWord}"` };
  }

  // El signo de interrogación explícito es señal fuerte cuando el motor lo pone.
  if (raw.includes('?')) {
    return { isQuestion: true, reason: 'signo de interrogación' };
  }

  const firstTwo = words.slice(0, 2).join(' ');
  if (INTERROGATIVE_OPENERS.includes(firstWord) || INTERROGATIVE_OPENERS.includes(firstTwo)) {
    return { isQuestion: true, reason: `interrogativo inicial: "${firstWord}"` };
  }

  // A partir de aquí, sólo en `balanced`. Son las reglas que recuperan las
  // preguntas que el ASR entrega sin signos, a cambio de algún disparo de más.
  if (sensitivity === 'strict') {
    return {
      isQuestion: false,
      reason: 'sin marcadores de pregunta (modo estricto)',
      // Ambigua igualmente: `strict` decide cuánto se arriesga la heurística,
      // no si el modelo puede opinar. Estricto + clasificador es de hecho la
      // combinación más precisa que hay — nada de adivinar por palabras, y el
      // modelo resolviendo las dudas.
      ambiguous: true,
    };
  }

  // Sobre el texto CRUDO: el acento sobrevive aquí y no en `normalized`.
  const accented = ACCENTED_INTERROGATIVE.exec(raw.toLowerCase());
  if (accented) {
    return { isQuestion: true, reason: `interrogativo acentuado: "${accented[2]}"` };
  }

  /*
   * Aperturas imperativas en CUALQUIER posición, no sólo al principio.
   *
   * Al unir los fragmentos de una intervención titubeante, el imperativo deja
   * de encabezar la frase: "Bueno... a ver, cuéntame sobre tu experiencia" es
   * una petición de manual y la comprobación de prefijo no la veía. Pedir algo
   * sigue siendo pedir algo aunque haya un titubeo delante.
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
   * Aquí es donde muere el techo de esta heurística, y por eso se marca como
   * duda en lugar de como descarte.
   *
   * "Una persona que conozca de DevOps debería conocer también de seguridad"
   * llega aquí, y es una pregunta: quien la dice espera que le contesten. Lo
   * que la hace pregunta no está en el léxico —está en que es una afirmación
   * dirigida a alguien— así que ninguna lista la va a coger nunca.
   */
  return { isQuestion: false, reason: 'sin marcadores de pregunta', ambiguous: true };
}
