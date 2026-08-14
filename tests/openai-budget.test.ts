import { describe, expect, it } from 'vitest';
import { budgetFor, OPENAI_MODELS } from '../src/main/llm/openai';

/**
 * The output budget of the Responses API.
 *
 * `max_output_tokens` is a **joint** cap: the tokens the model spends reasoning
 * come out of the same pot as the text that's read. It's exactly the same trap as
 * `num_predict` in Ollama, and it produces the same silent failure — with code
 * mode's 2,200 cap, a model that thinks can finish without writing a single
 * character, no error, and the app can only say "it returned no text".
 *
 * This pins the slack because the temptation to "simplify" `budgetFor` to a bare
 * `request.maxTokens` is exactly what would bring it back.
 */
describe('output budget in OpenAI', () => {
  it('lends plenty of tokens when the reasoning block is sent', () => {
    // Code mode's cap: what's wanted is for the answer to fit WHOLE on top of
    // whatever is thought before.
    const budget = budgetFor(2_200, true);
    expect(budget).toBeGreaterThan(2_200 * 2);
  });

  it("doesn't touch the cap when the model doesn't reason", () => {
    // The short cap exists for a reason —an answer read out of the corner of your
    // eye— and mustn't be loosened for a model that won't spend anything thinking.
    expect(budgetFor(700, false)).toBe(700);
    expect(budgetFor(2_200, false)).toBe(2_200);
  });

  it('the slack is the same whatever is asked for', () => {
    // It's a loan for reasoning, not a percentage of the cap: multiplying would
    // make quiz mode —with 700— have less room to think than code mode, and
    // thinking costs the same in both.
    expect(budgetFor(2_200, true) - 2_200).toBe(budgetFor(700, true) - 700);
  });
});

describe('OpenAI catalog', () => {
  it('every model it offers reads images', () => {
    // The catalog is also used for the screen model, where the capture IS the
    // prompt: offering one without vision there would make the model invent the
    // whole exercise and the answer would look perfect.
    for (const model of OPENAI_MODELS) {
      expect(model.supportsVision, model.id).toBe(true);
    }
  });

  it("the ids carry no spaces or adornments", () => {
    // They're compared character by character against the provider's: an id with a
    // space gives a 404 whose message sends you to look for the right model when
    // the model was already the right one.
    for (const model of OPENAI_MODELS) {
      expect(model.id).toMatch(/^[a-z0-9.-]+$/);
    }
  });
});
