import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from '../src/main/core/question-detector';

/**
 * El fallo que motivó la fusión de fragmentos.
 *
 * El VAD cierra el turno tras 700 ms de silencio, y quien titubea hace pausas
 * más largas que eso a mitad de frase. La versión anterior disparaba con el
 * PRIMER fragmento y silenciaba 2,5 s los siguientes: respondía al titubeo y
 * descartaba la pregunta.
 *
 * Estos casos comprueban lo que importa de verdad: que el texto unido se
 * detecte como pregunta cuando los trozos sueltos no lo hacen.
 */
describe('fragmentos de una misma pregunta', () => {
  const join = (parts: string[]): string => parts.join(' ').replace(/\s+/g, ' ').trim();

  it('el preámbulo suelto no es una pregunta, pero el conjunto sí', () => {
    const fragmentos = ['Entonces, eh...', 'lo que quería preguntarte es', '¿cómo lo harías tú?'];

    // Así se comportaba antes: se juzgaba el primer trozo y se respondía a eso.
    expect(looksLikeQuestion(fragmentos[0] ?? '').isQuestion).toBe(false);
    // Y así ahora.
    expect(looksLikeQuestion(join(fragmentos)).isQuestion).toBe(true);
  });

  it('rescata la pregunta cuando el titubeo va delante', () => {
    const casos = [
      ['Bueno...', 'a ver', 'cuéntame sobre tu experiencia con Kubernetes'],
      ['Mira,', 'una cosa,', '¿qué base de datos usarías para esto?'],
      ['Vale.', 'Y entonces', 'cómo manejarías un pico de tráfico'],
    ];
    for (const partes of casos) {
      expect(looksLikeQuestion(join(partes)).isQuestion).toBe(true);
    }
  });

  it('unir no convierte en pregunta lo que no lo es', () => {
    // El precio de fusionar seria disparar de mas; estas siguen sin disparar.
    const partes = ['Bueno, pues nada.', 'Eso es todo por mi parte.', 'Gracias.'];
    expect(looksLikeQuestion(join(partes)).isQuestion).toBe(false);
  });

  it('una pregunta que llega entera sigue detectándose igual', () => {
    // Fusionar no puede empeorar el caso simple, que es el más común.
    expect(looksLikeQuestion('¿Cuál es tu mayor debilidad?').isQuestion).toBe(true);
  });
});
