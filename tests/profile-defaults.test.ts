import { describe, expect, it } from 'vitest';
import { defaultProfilePrompts } from '../src/main/core/prompt';
import { EDITABLE_PROFILES } from '../src/shared/types';

describe('defaultProfilePrompts', () => {
  it('seeds every editable profile in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      const defaults = defaultProfilePrompts(lang);
      for (const id of EDITABLE_PROFILES) {
        expect(defaults[id]?.trim()).toBeTruthy();
      }
    }
  });

  it('serves the interface language, not the prompt-internal Spanish', () => {
    // The whole point: an international user reads and edits the profile in the
    // app's language. The Spanish runtime prompt is untouched; only this seed
    // localises.
    const en = defaultProfilePrompts('en');
    expect(en.interview).toContain('being interviewed');
    expect(en.interview).not.toContain('siendo entrevistada');
    expect(en.quiz).toContain('ONE line per question');

    const es = defaultProfilePrompts('es');
    expect(es.interview).toContain('siendo entrevistada');
    expect(es.quiz).toContain('UNA línea por pregunta');
  });

  it('falls back to English for an unknown interface language', () => {
    // UILang is en|es today; the fallback protects a future language added
    // without its own seed.
    expect(defaultProfilePrompts('xx' as 'en')).toEqual(defaultProfilePrompts('en'));
  });
});
