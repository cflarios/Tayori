import { describe, expect, it } from 'vitest';
import { budgetFor } from '../src/main/llm/ollama';

/**
 * The output budget of the models that reason.
 *
 * The bug this pins gave no error: `qwen3-vl:8b-thinking` with code mode's cap of
 * 2,200 tokens spent **all** the budget thinking —Ollama returns the reasoning in
 * `message.thinking`, apart from `message.content`, and `num_predict` counts
 * both— and the stream ended clean, with `done_reason: "length"` and zero
 * characters of answer. The app said "El modelo no devolvió texto", which points
 * nowhere.
 */
describe('output budget in Ollama', () => {
  it('lends plenty of tokens to a model that reasons', () => {
    // What was measured: the reasoning was 10 to 50 times longer than the
    // answer, so the slack has to be an order of magnitude, not a courtesy
    // margin.
    const budget = budgetFor('qwen3-vl:8b-thinking', 2_200);
    expect(budget).toBeGreaterThan(2_200 * 4);
  });

  it("doesn't touch a normal model's cap", () => {
    // The short cap exists for a reason —an answer read out of the corner of your
    // eye— and mustn't be loosened for everyone because of the ones that think.
    expect(budgetFor('llama3.2:3b', 700)).toBe(700);
    expect(budgetFor('qwen2.5vl:latest', 2_200)).toBe(2_200);
  });

  it('recognizes the reasoning families by more than the word "thinking"', () => {
    for (const model of ['deepseek-r1:7b', 'qwq:32b', 'algo-reasoning:latest']) {
      expect(budgetFor(model, 700)).toBeGreaterThan(700);
    }
  });

  it("isn't fooled by a name that only resembles one", () => {
    // "vision" contains "sion", not "reason": the check is by substring and it's
    // worth pinning that it doesn't fire on just anything.
    expect(budgetFor('llava:13b', 700)).toBe(700);
  });
});
