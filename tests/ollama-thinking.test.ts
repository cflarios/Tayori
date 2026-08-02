import { describe, expect, it } from 'vitest';
import { budgetFor } from '../src/main/llm/ollama';

/**
 * El presupuesto de salida de los modelos que razonan.
 *
 * El fallo que esto fija no daba ningún error: `qwen3-vl:8b-thinking` con el
 * tope de 2.200 tokens del modo código gastaba **todo** el presupuesto pensando
 * —Ollama devuelve el razonamiento en `message.thinking`, aparte de
 * `message.content`, y `num_predict` cuenta los dos— y el stream terminaba
 * limpio, con `done_reason: "length"` y cero caracteres de respuesta. La app
 * decía "El modelo no devolvió texto", que no señala a ninguna parte.
 */
describe('presupuesto de salida en Ollama', () => {
  it('presta tokens de sobra a un modelo que razona', () => {
    // Lo medido: el razonamiento fue de 10 a 50 veces más largo que la
    // respuesta, así que la holgura tiene que ser un orden de magnitud, no un
    // margen de cortesía.
    const budget = budgetFor('qwen3-vl:8b-thinking', 2_200);
    expect(budget).toBeGreaterThan(2_200 * 4);
  });

  it('no toca el tope de un modelo normal', () => {
    // El tope corto existe por una razón —una respuesta que se lee de reojo— y
    // no debe aflojarse para todos por culpa de los que piensan.
    expect(budgetFor('llama3.2:3b', 700)).toBe(700);
    expect(budgetFor('qwen2.5vl:latest', 2_200)).toBe(2_200);
  });

  it('reconoce las familias que razonan por algo más que la palabra "thinking"', () => {
    for (const model of ['deepseek-r1:7b', 'qwq:32b', 'algo-reasoning:latest']) {
      expect(budgetFor(model, 700)).toBeGreaterThan(700);
    }
  });

  it('no se deja engañar por un nombre que sólo se le parece', () => {
    // "vision" contiene "sion", no "reason": la comprobación es por subcadena y
    // conviene fijar que no se dispara con cualquier cosa.
    expect(budgetFor('llava:13b', 700)).toBe(700);
  });
});
