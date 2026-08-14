import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/main/core/prompt';
import {
  adviseLocalModels,
  alignAutoTrigger,
  DEFAULT_SETTINGS,
  isScreenTrigger,
  normalizeModelId,
  screenModelFor,
  type Settings,
} from '../src/shared/types';
import { translate } from '../src/shared/i18n';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('screenModelFor', () => {
  it('by default inherits the answer model', () => {
    // It's what guarantees that whoever touches nothing keeps the behavior from
    // before this setting existed.
    const target = screenModelFor(settings());
    expect(target).toEqual({ providerId: 'claude', model: 'claude-sonnet-5', inherited: true });
  });

  it("a dedicated provider for the screen doesn't touch the conversing one", () => {
    const current = settings({
      llmProviderId: 'claude',
      screenProviderId: 'ollama',
      screenModel: 'qwen2.5vl:7b',
    });

    expect(screenModelFor(current)).toEqual({
      providerId: 'ollama',
      model: 'qwen2.5vl:7b',
      inherited: false,
    });
    // The conversing one stays intact.
    expect(current.llmProviderId).toBe('claude');
  });

  it("with no model chosen it falls back to the provider's instead of staying empty", () => {
    // An empty field would give a provider error about a setting the user doesn't
    // know exists; answering with something is preferable.
    const target = screenModelFor(settings({ screenProviderId: 'gemini', screenModel: '' }));
    expect(target.model).toBe('gemini-3.6-flash');
  });

  it('the same provider can carry a different model', () => {
    // The Ollama case: a small fast one to talk, a multimodal one for the screen,
    // both local.
    const target = screenModelFor(
      settings({
        llmProviderId: 'ollama',
        llmModels: {
          claude: 'claude-sonnet-5',
          gemini: 'gemini-3.6-flash',
          openai: 'gpt-5.6-terra',
          deepseek: 'deepseek-v4-flash',
          ollama: 'llama3.2:3b',
        },
        screenProviderId: 'ollama',
        screenModel: 'qwen2.5vl:7b',
      })
    );
    expect(target.model).toBe('qwen2.5vl:7b');
  });
});

describe('isScreenTrigger', () => {
  it('distinguishes the screen triggers from the rest', () => {
    expect(isScreenTrigger('code')).toBe(true);
    expect(isScreenTrigger('quiz')).toBe(true);
    expect(isScreenTrigger('hotkey')).toBe(false);
    expect(isScreenTrigger('auto')).toBe(false);
    expect(isScreenTrigger('manual-input')).toBe(false);
  });
});

describe('quiz profile', () => {
  it('brings its own rules, not the speaking or the code ones', () => {
    const prompt = buildSystemPrompt(settings(), 'quiz');

    expect(prompt).toContain('UNA línea por pregunta');
    expect(prompt).toContain('DUDA:');
    expect(prompt).not.toContain('Máximo 4 viñetas');
    expect(prompt).not.toContain('El código COMPLETO');
  });

  it('asks for ALL the questions and no explanation', () => {
    // The two things that went wrong using it for real, and both were the
    // prompt's: it asked to keep a single question and asked for the why.
    const prompt = buildSystemPrompt(settings(), 'quiz');

    expect(prompt).toContain('Responde TODAS las preguntas');
    expect(prompt).toContain('sin explicación');
    expect(prompt).not.toMatch(/línea con el porqué/);
  });

  it('bans markdown in the three profiles read in the panel', () => {
    // The models mark things in bold on their own and the overlay showed the
    // asterisks. It's attacked by prompt AND by render; this covers the prompt
    // half.
    for (const profile of ['interview', 'coding', 'quiz'] as const) {
      expect(buildSystemPrompt(settings(), profile).toLowerCase()).toContain('asterisco');
    }
  });

  it("warns about the prompt's negations, which is where mistakes are made", () => {
    expect(buildSystemPrompt(settings(), 'quiz')).toContain('cuál NO');
  });

  it("the forced profile doesn't touch the configured one", () => {
    const current = settings({ promptProfileId: 'interview' });
    expect(buildSystemPrompt(current, 'quiz')).toContain('DUDA:');
    expect(buildSystemPrompt(current)).toContain('Máximo 4 viñetas');
  });
});

describe('adviseLocalModels', () => {
  it('recommends something for each memory tier', () => {
    for (const totalMemoryGB of [4, 8, 16, 32, 64]) {
      const advice = adviseLocalModels({ totalMemoryGB, cpuModel: 'x', cpuCores: 8 });
      expect(advice.chat.model).toBeTruthy();
      expect(advice.vision.model).toBeTruthy();
      expect(advice.caveat).toBeTruthy();
      // The tier comes out as a key with a slot: the figure is put by whoever paints.
      expect(translate('en', advice.tier, { ram: totalMemoryGB })).toContain(String(totalMemoryGB));
    }
  });

  it("with more memory, it doesn't recommend a smaller model", () => {
    const poco = adviseLocalModels({ totalMemoryGB: 4, cpuModel: 'x', cpuCores: 4 });
    const mucho = adviseLocalModels({ totalMemoryGB: 64, cpuModel: 'x', cpuCores: 16 });
    expect(poco.chat.model).not.toBe(mucho.chat.model);
  });

  it("with little memory it says local is no good for the screen", () => {
    // It's the honest part of the recommendation: with 4 GB the model fits and
    // still gets captures wrong, which is what has to be warned about.
    const advice = adviseLocalModels({ totalMemoryGB: 4, cpuModel: 'x', cpuCores: 4 });
    expect(translate('es', advice.caveat)).toContain('nube');
    expect(translate('en', advice.caveat)).toContain('cloud');
  });
});

/**
 * The Claude and Gemini catalog is in the code, so it ages: a new model from the
 * provider can't be used until an app version comes out. Writing the id by hand
 * is the way out, and this covers the part with logic.
 */
describe('normalizeModelId', () => {
  it('leaves a well-written id intact', () => {
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('removes the trailing space a copy-paste leaves', () => {
    // It's the real case: you copy the id from a documentation page, it arrives
    // with a space after it, and the provider responds 404. The message says "the
    // model doesn't exist", which sends you to look for the right model when it
    // already was.
    expect(normalizeModelId('claude-opus-4-8 ')).toBe('claude-opus-4-8');
    expect(normalizeModelId('  gemini-2.5-pro\n')).toBe('gemini-2.5-pro');
  });

  it('also removes the spaces in the middle', () => {
    // No provider uses spaces in an id, so an interior space can only come from a
    // clipboard line break.
    expect(normalizeModelId('claude-sonnet\n-5')).toBe('claude-sonnet-5');
    expect(normalizeModelId('qwen2.5vl: 7b')).toBe('qwen2.5vl:7b');
  });

  it('a field that is empty or only spaces ends up empty', () => {
    expect(normalizeModelId('   ')).toBe('');
    expect(normalizeModelId('')).toBe('');
  });
});

/**
 * The language, seen in a real conversation: question and answer in English, but
 * the structure labels in Spanish, copied literally from the prompt
 * ("**Situación:** I manage a web application…"). These tests pin the two halves
 * of the fix — the rule exists in ALL profiles, and the model is no longer given
 * Spanish labels to copy.
 */
describe('the answer language', () => {
  const perfiles = ['interview', 'meeting', 'lecture', 'support', 'coding', 'quiz'] as const;

  it('all profiles carry the language rule', () => {
    // It used to live inside the speaking rules, so code and quiz —which replace
    // them entirely— were left without any.
    for (const profile of perfiles) {
      const prompt = buildSystemPrompt(settings(), profile);
      expect(prompt, profile).toContain('idioma de la conversación');
      expect(prompt, profile).toContain('ENTERA en ese idioma');
    }
  });

  it("warns that the instructions being in Spanish obliges nothing", () => {
    // It's the model's specific confusion: prompt in Spanish, so I answer with
    // Spanish bits.
    expect(buildSystemPrompt(settings())).toContain('no en el de estas');
  });

  it('the interview profile no longer dictates copyable labels', () => {
    const prompt = buildSystemPrompt(settings(), 'interview');
    expect(prompt).not.toMatch(/situación → acción → resultado/i);
    expect(prompt).toContain('No escribas rótulos');
  });

  it('quiz mode orders its two fixed markers translated', () => {
    const prompt = buildSystemPrompt(settings(), 'quiz');
    expect(prompt).toContain('UNSURE:');
    expect(prompt).toContain("CAN'T SEE:");
  });
});

/**
 * Pressing "Them" has to give answers, not silence. It's the failure that was
 * fixed by hand from the dashboard without the relationship being obvious.
 */
describe('alignAutoTrigger', () => {
  it('choosing only the system output passes the trigger to the other party', () => {
    const current = settings({ audioSources: 'both', autoTriggerSpeaker: 'me' });
    expect(alignAutoTrigger(current, { audioSources: 'system' })).toEqual({
      audioSources: 'system',
      autoTriggerSpeaker: 'them',
    });
  });

  it('choosing only the microphone passes the trigger to you', () => {
    const current = settings({ audioSources: 'both', autoTriggerSpeaker: 'them' });
    expect(alignAutoTrigger(current, { audioSources: 'mic' })).toEqual({
      audioSources: 'mic',
      autoTriggerSpeaker: 'me',
    });
  });

  it("doesn't touch anything if the combination could already fire", () => {
    const current = settings({ audioSources: 'mic', autoTriggerSpeaker: 'them' });
    // With both sources everyone is heard: there's nothing to realign.
    expect(alignAutoTrigger(current, { audioSources: 'both' })).toEqual({ audioSources: 'both' });
  });

  it('respects "any" and the trigger being off', () => {
    // Neither of the two can end up inert, so changing them would be touching a
    // setting for no reason.
    const any = settings({ autoTriggerSpeaker: 'any' });
    expect(alignAutoTrigger(any, { audioSources: 'mic' })).toEqual({ audioSources: 'mic' });

    const off = settings({ autoTriggerMode: 'off', autoTriggerSpeaker: 'them' });
    expect(alignAutoTrigger(off, { audioSources: 'mic' })).toEqual({ audioSources: 'mic' });
  });

  it("doesn't interfere when the patch doesn't change the sources", () => {
    // Changing the speaker by hand from the dashboard is an explicit choice.
    const current = settings({ audioSources: 'system' });
    expect(alignAutoTrigger(current, { autoTriggerSpeaker: 'me' })).toEqual({
      autoTriggerSpeaker: 'me',
    });
  });
});

/**
 * The quiz mode's "DUDA:" marker, which stopped being useful by being used always.
 *
 * Tested with a small local model, it answered ALL the lines with "DUDA:" in
 * front. And it was asked for: the rule said «if you doubt, start that line with
 * DUDA:» without saying anywhere that it was the exception. A model that marks
 * everything is obeying, and the marker stops informing of anything — which is
 * exactly the same as not having it.
 */
describe('the doubt rule in quiz mode', () => {
  it("says it's the exception, not the format", () => {
    // Pieces that fit on one line are checked: the prompt is wrapped at 80
    // columns and asserting a long sentence would break the test on rewrapping.
    const prompt = buildSystemPrompt(settings(), 'quiz');
    expect(prompt).toContain('es la EXCEPCIÓN, no el formato');
    expect(prompt).toContain('si está en todas las líneas');
  });

  it('explicitly bans marking everything', () => {
    // Without this sentence, a small model plays it safe and marks every line.
    const prompt = buildSystemPrompt(settings(), 'quiz');
    expect(prompt).toContain('Marcarlo todo no informa de nada');
  });

  it('still requires the best option behind the marker', () => {
    // Refusing to answer doesn't help anyone either: in a quiz with a penalty you
    // have to be able to decide whether to risk it, and for that you need the option.
    expect(buildSystemPrompt(settings(), 'quiz')).toContain('Nunca es "DUDA:" a secas');
  });
});
