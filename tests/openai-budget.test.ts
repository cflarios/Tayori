import { describe, expect, it } from 'vitest';
import { budgetFor, OPENAI_MODELS } from '../src/main/llm/openai';

/**
 * El presupuesto de salida de la Responses API.
 *
 * `max_output_tokens` es un tope **conjunto**: los tokens que el modelo gasta
 * razonando salen del mismo saco que el texto que se lee. Es exactamente la
 * misma trampa que `num_predict` en Ollama, y produce el mismo fallo mudo — con
 * el tope de 2.200 del modo código, un modelo que piensa puede terminar sin
 * escribir ni un carácter, sin ningún error, y la app sólo puede decir "no
 * devolvió texto".
 *
 * Esto fija la holgura porque la tentación de "simplificar" `budgetFor` a
 * `request.maxTokens` seco es justo lo que lo devolvería.
 */
describe('presupuesto de salida en OpenAI', () => {
  it('presta tokens de sobra cuando se manda el bloque de razonamiento', () => {
    // El tope del modo código: lo que se quiere es que la respuesta quepa
    // ENTERA además de lo que se piense antes.
    const budget = budgetFor(2_200, true);
    expect(budget).toBeGreaterThan(2_200 * 2);
  });

  it('no toca el tope cuando el modelo no razona', () => {
    // El tope corto existe por una razón —una respuesta que se lee de reojo— y
    // no debe aflojarse para un modelo que no va a gastar nada pensando.
    expect(budgetFor(700, false)).toBe(700);
    expect(budgetFor(2_200, false)).toBe(2_200);
  });

  it('la holgura es la misma se pida lo que se pida', () => {
    // Es un préstamo para razonar, no un porcentaje del tope: multiplicar
    // haría que el modo test —con 700— tuviera menos margen para pensar que el
    // de código, y pensar cuesta lo mismo en los dos.
    expect(budgetFor(2_200, true) - 2_200).toBe(budgetFor(700, true) - 700);
  });
});

describe('catálogo de OpenAI', () => {
  it('todos los modelos que ofrece leen imágenes', () => {
    // El catálogo se usa también para el modelo de pantalla, donde la captura
    // ES el enunciado: ofrecer ahí uno sin visión haría que el modelo se
    // inventara el ejercicio entero y la respuesta parecería perfecta.
    for (const model of OPENAI_MODELS) {
      expect(model.supportsVision, model.id).toBe(true);
    }
  });

  it('los ids no llevan espacios ni adornos', () => {
    // Se comparan carácter a carácter contra los del proveedor: un id con un
    // espacio da un 404 cuyo mensaje manda a buscar el modelo bueno cuando el
    // modelo ya era el bueno.
    for (const model of OPENAI_MODELS) {
      expect(model.id).toMatch(/^[a-z0-9.-]+$/);
    }
  });
});
