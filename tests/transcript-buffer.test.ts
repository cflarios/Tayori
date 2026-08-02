import { describe, expect, it } from 'vitest';
import { TranscriptBuffer } from '../src/main/core/transcript-buffer';

describe('TranscriptBuffer', () => {
  it('consolida parciales del mismo hablante en un solo segmento', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Cuéntame', false);
    buffer.ingest('them', 'sobre tu', false);
    buffer.ingest('them', 'experiencia', true);

    // Lo esencial: tres parciales no producen tres líneas.
    expect(buffer.all()).toHaveLength(1);
    expect(buffer.all()[0]?.text).toBe('Cuéntame sobre tu experiencia');
    expect(buffer.all()[0]?.isFinal).toBe(true);
  });

  it('mantiene segmentos separados por hablante aunque se solapen', () => {
    const buffer = new TranscriptBuffer();

    // Caso real: ambos hablan a la vez y los parciales se entrelazan.
    buffer.ingest('them', '¿Qué es', false);
    buffer.ingest('me', 'Bueno,', false);
    buffer.ingest('them', 'un closure?', true);
    buffer.ingest('me', 'es una función', true);

    expect(buffer.all()).toHaveLength(2);
    expect(buffer.lastFrom('them')?.text).toBe('¿Qué es un closure?');
    expect(buffer.lastFrom('me')?.text).toBe('Bueno, es una función');
  });

  it('abre un segmento nuevo tras finalizar el anterior', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Primera pregunta', true);
    buffer.ingest('them', 'Segunda pregunta', true);

    expect(buffer.all()).toHaveLength(2);
  });

  it('pega la puntuación sin dejar espacio delante', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Hola', false);
    buffer.ingest('them', ', ¿qué tal', false);
    buffer.ingest('them', '?', true);

    expect(buffer.all()[0]?.text).toBe('Hola, ¿qué tal?');
  });

  it('respeta los espacios que ya trae el fragmento sin duplicarlos', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'uno', false);
    buffer.ingest('them', ' dos', false);
    buffer.ingest('them', ' tres', true);

    expect(buffer.all()[0]?.text).toBe('uno dos tres');
  });

  it('finalizeOpen cierra un segmento que el motor dejó abierto', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'frase sin cerrar', false);
    expect(buffer.all()[0]?.isFinal).toBe(false);

    const closed = buffer.finalizeOpen('them');

    expect(closed?.isFinal).toBe(true);
    expect(closed?.endedAt).toBeTypeOf('number');
    // Y un ingest posterior debe empezar un segmento nuevo, no reabrir el viejo.
    buffer.ingest('them', 'frase nueva', true);
    expect(buffer.all()).toHaveLength(2);
  });

  it('finalizeOpen no falla si no hay nada abierto', () => {
    const buffer = new TranscriptBuffer();
    expect(buffer.finalizeOpen('me')).toBeNull();
  });

  it('recorta a maxSegments descartando los más antiguos', () => {
    const buffer = new TranscriptBuffer(3);

    for (let i = 1; i <= 5; i++) buffer.ingest('them', `frase ${i}`, true);

    expect(buffer.all()).toHaveLength(3);
    expect(buffer.all()[0]?.text).toBe('frase 3');
    expect(buffer.all()[2]?.text).toBe('frase 5');
  });

  it('no sigue escribiendo en un segmento abierto que ya fue recortado', () => {
    const buffer = new TranscriptBuffer(2);

    // 'me' queda abierto y luego es desplazado por segmentos más nuevos.
    buffer.ingest('me', 'viejo abierto', false);
    buffer.ingest('them', 'uno', true);
    buffer.ingest('them', 'dos', true);

    // El segmento de 'me' ya salió del buffer; un ingest debe crear uno nuevo
    // en lugar de mutar el objeto huérfano.
    buffer.ingest('me', 'nuevo', true);

    expect(buffer.lastFrom('me')?.text).toBe('nuevo');
  });

  it('formatea con etiquetas explícitas de rol y omite los vacíos', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', '¿Por qué este puesto?', true);
    buffer.ingest('me', '   ', true);
    buffer.ingest('me', 'Por el equipo', true);

    expect(buffer.format()).toBe('ENTREVISTADOR: ¿Por qué este puesto?\nYO: Por el equipo');
  });

  it('recent filtra por antigüedad', () => {
    const buffer = new TranscriptBuffer();

    const old = buffer.ingest('them', 'antiguo', true);
    old.startedAt = Date.now() - 60_000;
    buffer.ingest('them', 'reciente', true);

    const recent = buffer.recent(30);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.text).toBe('reciente');
  });
});

/**
 * Parciales acumulativos, que son los de la API en tiempo real de OpenAI.
 *
 * El fallo que esto fija se vio en pantalla: la frase salía **dos veces**, y la
 * primera copia con las palabras partidas ("conoz ca", "ingen ieros"). La causa
 * era tratar como incremental un `completed` que trae el turno entero, así que
 * el buffer lo concatenaba detrás de los parciales que ya había acumulado.
 */
describe('parciales acumulativos', () => {
  it('el texto acumulativo REEMPLAZA en vez de concatenarse', () => {
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Una persona que', false, true);
    buffer.ingest('them', 'Una persona que sepa DevOps', false, true);
    const final = buffer.ingest('them', 'Una persona que sepa DevOps.', true, true);

    expect(final.text).toBe('Una persona que sepa DevOps.');
  });

  it('sin la marca sigue concatenando, que es lo que necesita Gemini', () => {
    // Los dos comportamientos conviven porque los motores difieren de verdad:
    // quitar el incremental rompería Gemini Live.
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'Una persona', false);
    const final = buffer.ingest('them', 'que sepa DevOps', true);

    expect(final.text).toBe('Una persona que sepa DevOps');
  });

  it('un acumulativo no arrastra el turno anterior', () => {
    // Cada turno abre su propio segmento: si el reemplazo se saltara el cierre,
    // la segunda frase machacaría la primera en lugar de añadirse.
    const buffer = new TranscriptBuffer();

    buffer.ingest('them', 'primera frase', true, true);
    buffer.ingest('them', 'segunda frase', true, true);

    expect(buffer.all().map((s) => s.text)).toEqual(['primera frase', 'segunda frase']);
  });
});
