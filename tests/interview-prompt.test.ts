import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, defaultProfilePrompts } from '../src/main/core/prompt';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types';

/**
 * The interview profile speaks; it doesn't hand over a fact sheet.
 *
 * It used to share the meeting/lecture/support format —four bullets, the fact
 * first— and the answers came out mechanical: on a troubleshooting hypothetical
 * it gave the exact diagnosis at once, which in a real interview sounds read.
 * What the model then does can't be asserted here; what's pinned is that the
 * prompt asks for it, and that the other profiles didn't change.
 */
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('interview profile', () => {
  const prompt = buildSystemPrompt(settings({ promptProfileId: 'interview' }));

  it('has its own spoken format instead of the shared bullets', () => {
    expect(prompt).toContain('Entre dos y cuatro frases cortas');
    expect(prompt).toContain('Registro hablado');
    expect(prompt).not.toContain('Máximo 4 viñetas');
  });

  it('asks before diagnosing a hypothetical, and stops asking once answered', () => {
    expect(prompt).toContain('troubleshooting');
    expect(prompt).toContain('una o dos preguntas al entrevistador');
    expect(prompt).toContain('no vuelvas a preguntar');
  });

  it("doesn't turn a conceptual question into stalling", () => {
    expect(prompt).toContain('sin preguntar antes');
  });

  it('keeps the rule against inventing experience', () => {
    expect(prompt).toContain('Nunca inventes datos');
  });

  it('leaves the other speaking profiles on the shared rules', () => {
    for (const profile of ['meeting', 'lecture', 'support'] as const) {
      const other = buildSystemPrompt(settings({ promptProfileId: profile }));
      expect(other).toContain('Máximo 4 viñetas');
      expect(other).not.toContain('Registro hablado');
    }
  });

  it('seeds the editable text with the same rules, in both languages', () => {
    expect(defaultProfilePrompts('es').interview).toContain('Registro hablado');
    expect(defaultProfilePrompts('en').interview).toContain('Spoken register');
    expect(defaultProfilePrompts('en').interview).not.toContain('At most 4 short bullets');
  });
});
