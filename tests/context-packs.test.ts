import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/main/core/prompt';
import {
  DEFAULT_SETTINGS,
  packsForProfile,
  type ContextPack,
  type PromptProfileId,
  type Settings,
} from '../src/shared/types';

const pack = (p: Partial<ContextPack>): ContextPack => ({
  id: crypto.randomUUID(),
  name: 'x',
  content: 'contenido',
  enabled: true,
  kind: 'notes',
  profiles: [],
  ...p,
});

const settings = (packs: ContextPack[], profile: PromptProfileId = 'interview'): Settings => ({
  ...DEFAULT_SETTINGS,
  promptProfileId: profile,
  contextPacks: packs,
});

describe('packsForProfile', () => {
  it('a pack with no profiles is always applied', () => {
    // It's what keeps working the packs created before the profiles existed:
    // nobody's configuration can be broken.
    const p = pack({ profiles: [] });
    for (const profile of ['interview', 'meeting', 'support'] as const) {
      expect(packsForProfile([p], profile)).toHaveLength(1);
    }
  });

  it('a pack with profiles is only applied in its own', () => {
    const p = pack({ profiles: ['interview'] });
    expect(packsForProfile([p], 'interview')).toHaveLength(1);
    expect(packsForProfile([p], 'meeting')).toHaveLength(0);
  });

  it('a disabled pack is applied in no profile', () => {
    expect(packsForProfile([pack({ enabled: false })], 'interview')).toHaveLength(0);
  });
});

describe('buildSystemPrompt', () => {
  it('switching profile changes the material that reaches the model', () => {
    const packs = [
      pack({ name: 'Mi CV', kind: 'cv', content: 'Diez años en backend', profiles: ['interview'] }),
      pack({ name: 'Roadmap', kind: 'notes', content: 'Q3: migración', profiles: ['meeting'] }),
    ];

    const entrevista = buildSystemPrompt(settings(packs, 'interview'));
    expect(entrevista).toContain('Diez años en backend');
    expect(entrevista).not.toContain('Q3: migración');

    const reunion = buildSystemPrompt(settings(packs, 'meeting'));
    expect(reunion).toContain('Q3: migración');
    expect(reunion).not.toContain('Diez años en backend');
  });

  it('each type arrives with its own instruction', () => {
    // The reason `ContextKind` exists: without this the model can't tell real
    // experience from a job listing or from an already-written answer.
    const cv = buildSystemPrompt(settings([pack({ kind: 'cv' })]));
    expect(cv).toContain('Experiencia REAL');

    const job = buildSystemPrompt(settings([pack({ kind: 'job' })]));
    expect(job).toContain('nunca para atribuirle experiencia');

    const qa = buildSystemPrompt(settings([pack({ kind: 'qa' })]));
    expect(qa).toContain('reutilízala casi literal');
  });

  it("the vocabulary doesn't slip into the prompt", () => {
    // Its place is the speech recognizer. In the prompt it would only take up
    // context window with a list the model doesn't need to answer.
    const prompt = buildSystemPrompt(
      settings([pack({ kind: 'vocabulary', content: 'Kubernetes, EmployeeBridge' })])
    );
    expect(prompt).not.toContain('EmployeeBridge');
  });

  it('with no applicable context the block is not emitted', () => {
    // Careful: you can't search for "<contexto>" plainly. The interview profile
    // MENTIONS it in its rules ("nunca inventes datos que no estén en
    // <contexto>"), so the string appears even with no block.
    const vacio = buildSystemPrompt(settings([pack({ content: '   ' })]));
    expect(vacio).not.toContain('Material preparado por la persona');

    const conContenido = buildSystemPrompt(settings([pack({ content: 'algo real' })]));
    expect(conContenido).toContain('Material preparado por la persona');
  });

  it('the custom profile uses the user prompt', () => {
    const prompt = buildSystemPrompt({
      ...DEFAULT_SETTINGS,
      promptProfileId: 'custom',
      customPrompt: 'Eres un pirata.',
    });
    expect(prompt).toContain('Eres un pirata.');
  });
});
