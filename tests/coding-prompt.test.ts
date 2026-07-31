import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/main/core/prompt';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types';

/**
 * Lo que se comprueba aquí es una sola cosa, y es la que hace que el modo código
 * sirva de algo: sus reglas de formato **sustituyen** a las de hablar, no se
 * suman. Con el máximo de cuatro viñetas puesto, el modelo devolvía el enfoque
 * resumido y ninguna implementación.
 */
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('perfil de código', () => {
  it('sustituye las reglas de hablar por las de escribir código', () => {
    const prompt = buildSystemPrompt(settings({ promptProfileId: 'coding' }));

    expect(prompt).toContain('```');
    expect(prompt).toContain('El código COMPLETO');
    expect(prompt).not.toContain('Máximo 4 viñetas');
    expect(prompt).not.toContain('leerse en voz alta');
  });

  it('los demás perfiles conservan las reglas de hablar', () => {
    for (const profile of ['interview', 'meeting', 'lecture', 'support'] as const) {
      expect(buildSystemPrompt(settings({ promptProfileId: profile }))).toContain(
        'Máximo 4 viñetas'
      );
    }
  });

  it('el perfil forzado gana al configurado, sin tocar los ajustes', () => {
    // Es el camino de Ctrl+Alt+C: resolver la pantalla en mitad de una
    // entrevista y que la siguiente pregunta hablada siga saliendo en viñetas.
    const configurado = settings({ promptProfileId: 'interview' });

    expect(buildSystemPrompt(configurado, 'coding')).toContain('El código COMPLETO');
    expect(buildSystemPrompt(configurado)).toContain('Máximo 4 viñetas');
    expect(configurado.promptProfileId).toBe('interview');
  });

  it('con lenguaje "auto" lo deduce de la pantalla', () => {
    const prompt = buildSystemPrompt(settings({ codeLanguage: 'auto' }), 'coding');
    expect(prompt).toContain('el lenguaje que se vea seleccionado');
  });

  it('un lenguaje fijado entra en el prompt', () => {
    const prompt = buildSystemPrompt(settings({ codeLanguage: 'Rust' }), 'coding');
    expect(prompt).toContain('Escribe la solución en Rust');
  });

  it('el contexto del perfil forzado es el que viaja, no el del configurado', () => {
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
