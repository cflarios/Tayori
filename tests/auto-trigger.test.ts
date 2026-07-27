import { describe, expect, it } from 'vitest';
import { autoTriggerIsInert, DEFAULT_SETTINGS, speakersFor } from '../src/shared/types';

/**
 * Regresión del bug que dejaba la app muda: con `audioSources: 'mic'` el carril
 * `them` ni se crea, así que el auto-disparo —que solo mira a `them`— descartaba
 * todos los segmentos en silencio. Ni error, ni traza, ni respuesta.
 */
describe('autoTriggerIsInert', () => {
  const settings = (patch: Partial<typeof DEFAULT_SETTINGS>): typeof DEFAULT_SETTINGS => ({
    ...DEFAULT_SETTINGS,
    ...patch,
  });

  it('detecta la combinación que no puede dispararse nunca', () => {
    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'them', autoTriggerMode: 'heuristic' })
      )
    ).toBe(true);

    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'system', autoTriggerSpeaker: 'me', autoTriggerMode: 'heuristic' })
      )
    ).toBe(true);
  });

  it('no marca como inerte lo que sí puede dispararse', () => {
    expect(autoTriggerIsInert(DEFAULT_SETTINGS)).toBe(false);

    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'me', autoTriggerMode: 'heuristic' })
      )
    ).toBe(false);

    // `any` se conforma con cualquier carril, y siempre hay al menos uno.
    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'any', autoTriggerMode: 'heuristic' })
      )
    ).toBe(false);
  });

  it('con el auto-disparo apagado no hay nada que avisar', () => {
    // Sin esta salida temprana el dashboard mostraría un aviso sobre una función
    // que el usuario ya ha desactivado a propósito.
    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'them', autoTriggerMode: 'off' })
      )
    ).toBe(false);
  });

  it('el default sigue escuchando al interlocutor', () => {
    // CONTEXT.md §5: precisión sobre recall. Que ahora sea configurable no
    // cambia el default.
    expect(DEFAULT_SETTINGS.autoTriggerSpeaker).toBe('them');
    expect(speakersFor(DEFAULT_SETTINGS.audioSources)).toContain('them');
  });
});
