import type { Settings } from '@shared/types';
import { createLLMProvider } from '../llm';
import type { QuestionVerdict } from './question-detector';

/**
 * El segundo escalón del auto-disparo: preguntarle al modelo.
 *
 * `question-detector.ts` es una heurística de palabras clave y tiene un techo
 * que no se puede subir con más listas. El caso que lo destapó, sacado de una
 * conversación real:
 *
 *   "Una persona que conozca de DevOps debería conocer también de seguridad."
 *   "Si una persona sabe DevOps, necesariamente tendría que saber de seguridad."
 *
 * Las dos son **preguntas** dichas en voz alta —quien las dice espera que le
 * contesten— y las dos llegan del reconocedor como oraciones afirmativas, sin
 * signo y sin ningún interrogativo. Ninguna lista de marcadores las va a coger,
 * porque lo que las hace preguntas no está en el léxico: está en que son
 * afirmaciones dirigidas a alguien que espera respuesta. Y añadir "debería" a
 * la heurística ya se probó y se descartó — dispara con "creo que debería haber
 * estudiado más", que no pide nada.
 *
 * Eso es lo que un modelo sí sabe leer, y es el escalón que `AutoTriggerMode`
 * llevaba prometido desde el principio en el tipo sin que existiera el código.
 *
 * ## Las tres reglas que lo hacen viable
 *
 * - **Sólo se pregunta por lo que la heurística no supo decidir.** Una
 *   muletilla o una frase de dos palabras se descartan gratis, como siempre.
 *   Pagar una llamada por un "vale, perfecto" sería absurdo.
 * - **Nunca bloquea.** Con reloj propio y `AbortSignal`: si el modelo tarda o
 *   falla, la respuesta es "no era una pregunta" y la app sigue como antes. Un
 *   clasificador caído no puede dejar la escucha colgada.
 * - **Cuesta dinero, y se dice.** Es una consulta más por cada intervención
 *   ambigua, y en un modelo que razona ni siquiera es una consulta barata. Por
 *   eso no es el valor por defecto y el dashboard lo avisa.
 */

/**
 * Tope de espera.
 *
 * Ocho segundos es mucho para un sí/no, y es a propósito: el listón lo pone un
 * modelo local en una máquina modesta, que es justo donde este modo tiene más
 * sentido porque la consulta no cuesta dinero. Pasado eso, la intervención ya
 * es agua pasada en una conversación en directo y contestar tarde es peor que
 * no contestar.
 */
const CLASSIFY_TIMEOUT_MS = 8_000;

/**
 * Presupuesto de salida.
 *
 * La respuesta útil es una palabra, pero el tope no puede ser de una palabra:
 * los modelos que razonan cuentan el pensamiento dentro de este mismo número y
 * se quedarían sin escribir nada — la trampa que ya está documentada tres veces
 * en este proyecto. Cada proveedor añade por su cuenta lo que necesite para
 * razonar (`budgetFor`), así que aquí basta con dejar sitio a la palabra.
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
 * `true` si la intervención pide una respuesta.
 *
 * No lanza nunca. Cualquier fallo —sin credencial, modelo caído, tiempo
 * agotado— se resuelve como `false`, que es el veredicto que ya tenía la
 * heurística: el modo degrada a `heuristic` en lugar de romperse.
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
        // La transcripción va vacía a propósito: lo que se clasifica es ESTA
        // intervención, y darle la conversación entera invita a contestar por
        // el contexto en lugar de por lo que se acaba de decir.
        transcript: '',
        question: text,
        maxTokens: CLASSIFY_MAX_TOKENS,
      },
      controller.signal
    )) {
      answer += chunk;
      // Con la primera palabra ya está decidido; seguir leyendo sería esperar
      // por tokens que no se van a mirar.
      if (answer.trim().length >= 2) break;
    }

    const verdict = answer.trim().toUpperCase();
    /*
     * Se acepta SI y también YES: el prompt está en español y los modelos
     * responden en el idioma de la conversación con más frecuencia de la que
     * uno espera — es la misma sorpresa que ya obligó a poner una regla de
     * idioma en todos los perfiles.
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
 * Si merece la pena gastar una consulta en esta intervención.
 *
 * Sólo se escala lo que la heurística marcó como **duda**. Un descarte por
 * muletilla o por longitud es una certeza: preguntarle al modelo si "vale,
 * perfecto" es una pregunta cuesta lo mismo que preguntarle algo útil, y la
 * respuesta ya se sabe.
 *
 * Lee un campo del veredicto y no el texto de `reason`, que está escrito para
 * que lo lea una persona. La primera versión comparaba el prefijo de la cadena
 * y un test la cazó enseguida: el motivo del modo estricto empieza igual, así
 * que la decisión dependía de cómo estuviera redactado un mensaje.
 */
export function worthClassifying(verdict: QuestionVerdict): boolean {
  return verdict.ambiguous === true;
}
