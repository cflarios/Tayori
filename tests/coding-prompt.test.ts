import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/main/core/prompt';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types';

/**
 * What's checked here is a single thing, and it's the one that makes code mode
 * useful: its format rules **replace** the speaking ones, they don't add. With
 * the maximum of four bullets set, the model returned the summarized approach
 * and no implementation.
 */
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('code profile', () => {
  it('replaces the speaking rules with the write-code ones', () => {
    const prompt = buildSystemPrompt(settings({ promptProfileId: 'coding' }));

    expect(prompt).toContain('```');
    expect(prompt).toContain('El código COMPLETO');
    expect(prompt).not.toContain('Máximo 4 viñetas');
    expect(prompt).not.toContain('leerse en voz alta');
  });

  it('the other profiles keep the speaking rules', () => {
    for (const profile of ['interview', 'meeting', 'lecture', 'support'] as const) {
      expect(buildSystemPrompt(settings({ promptProfileId: profile }))).toContain(
        'Máximo 4 viñetas'
      );
    }
  });

  it('the forced profile wins over the configured one, without touching the settings', () => {
    // It's the Ctrl+Alt+C path: solving the screen mid-interview and having the
    // next spoken question still come out in bullets.
    const configurado = settings({ promptProfileId: 'interview' });

    expect(buildSystemPrompt(configurado, 'coding')).toContain('El código COMPLETO');
    expect(buildSystemPrompt(configurado)).toContain('Máximo 4 viñetas');
    expect(configurado.promptProfileId).toBe('interview');
  });

  it('with language "auto" it deduces it from the screen', () => {
    const prompt = buildSystemPrompt(settings({ codeLanguage: 'auto' }), 'coding');
    expect(prompt).toContain('el lenguaje que se vea seleccionado');
  });

  it('a fixed language enters the prompt', () => {
    const prompt = buildSystemPrompt(settings({ codeLanguage: 'Rust' }), 'coding');
    expect(prompt).toContain('Escribe la solución en Rust');
  });

  it("the forced profile's context is the one that travels, not the configured one's", () => {
    const prompt = buildSystemPrompt(
      settings({
        promptProfileId: 'interview',
        contextPacks: [
          {
            id: '1',
            name: 'Mi CV',
            kind: 'cv',
            content: 'Diez años en backend',
            enabled: true,
            profiles: ['interview'],
          },
          {
            id: '2',
            name: 'Preferencias',
            kind: 'notes',
            content: 'Evita recursión',
            enabled: true,
            profiles: ['coding'],
          },
        ],
      }),
      'coding'
    );

    expect(prompt).toContain('Evita recursión');
    expect(prompt).not.toContain('Diez años en backend');
  });
});
