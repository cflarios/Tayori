import { fence } from '../core/untrusted';
import type { AnswerRequest } from './types';

/**
 * El turno de usuario, igual para los cinco proveedores.
 *
 * Estaba copiado en `claude.ts`, `gemini.ts`, `openai.ts`, `deepseek.ts` y
 * `ollama.ts`, con cinco versiones casi idénticas del mismo `<transcripcion>`
 * construido a mano. Mientras sólo era formato, la duplicación se aguantaba;
 * desde que ese sobre es una **frontera de seguridad** deja de aguantarse:
 * una defensa que hay que acordarse de repetir en cinco archivos —y en el sexto
 * el día que se añada un proveedor— es una defensa que se va a olvidar.
 *
 * De aquí salen todos los sobres, y de `core/untrusted.ts` sale su contenido ya
 * desarmado. Si alguien vuelve a escribir `<transcripcion>` a mano en un
 * proveedor, ha abierto un agujero.
 */
export function buildUserTurn(
  request: AnswerRequest,
  /**
   * Si ESTE proveedor manda de verdad la captura.
   *
   * No es lo mismo que «hay una captura»: DeepSeek no la manda nunca, y
   * anunciarle al modelo una imagen que no ha recibido es invitarle a
   * inventarse el enunciado.
   */
  sendsImages: boolean
): string {
  const parts = [fence('transcripcion', request.transcript || '(sin audio aún)')];

  if (request.question) parts.push(fence('pregunta', request.question));

  if (sendsImages && request.images?.length) {
    parts.push('El usuario adjuntó una captura de su pantalla; tenla en cuenta.');
  }

  /*
   * La instrucción va al final: es la posición que el modelo atiende con más
   * fuerza, y además mantiene estable el prefijo cacheable de arriba.
   *
   * Va **fuera de todo sobre** a propósito. Es lo único de este mensaje que sí
   * es una orden nuestra, y se distingue de lo de dentro por estar fuera.
   */
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}
