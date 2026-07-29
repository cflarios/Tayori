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
  it('un pack sin perfiles se aplica siempre', () => {
    // Es lo que mantiene funcionando a los packs creados antes de que los
    // perfiles existieran: no se puede romper la configuración de nadie.
    const p = pack({ profiles: [] });
    for (const profile of ['interview', 'meeting', 'support'] as const) {
      expect(packsForProfile([p], profile)).toHaveLength(1);
    }
  });

  it('un pack con perfiles solo se aplica en los suyos', () => {
    const p = pack({ profiles: ['interview'] });
    expect(packsForProfile([p], 'interview')).toHaveLength(1);
    expect(packsForProfile([p], 'meeting')).toHaveLength(0);
  });

  it('un pack desactivado no se aplica en ningún perfil', () => {
    expect(packsForProfile([pack({ enabled: false })], 'interview')).toHaveLength(0);
  });
});

describe('buildSystemPrompt', () => {
  it('cambiar de perfil cambia el material que llega al modelo', () => {
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

  it('cada tipo llega con su propia instrucción', () => {
    // La razón de ser de `ContextKind`: sin esto el modelo no puede distinguir
    // experiencia real de un anuncio de empleo ni de una respuesta ya escrita.
    const cv = buildSystemPrompt(settings([pack({ kind: 'cv' })]));
    expect(cv).toContain('Experiencia REAL');

    const job = buildSystemPrompt(settings([pack({ kind: 'job' })]));
    expect(job).toContain('nunca para atribuirle experiencia');

    const qa = buildSystemPrompt(settings([pack({ kind: 'qa' })]));
    expect(qa).toContain('reutilízala casi literal');
  });

  it('el vocabulario no se cuela en el prompt', () => {
    // Su sitio es el reconocedor de voz. En el prompt solo ocuparía ventana de
    // contexto con una lista que el modelo no necesita para responder.
    const prompt = buildSystemPrompt(
      settings([pack({ kind: 'vocabulary', content: 'Kubernetes, EmployeeBridge' })])
    );
    expect(prompt).not.toContain('EmployeeBridge');
  });

  it('sin contexto aplicable no se emite el bloque', () => {
    // Ojo: no se puede buscar "<contexto>" a secas. El perfil de entrevista lo
    // MENCIONA en sus reglas ("nunca inventes datos que no estén en
    // <contexto>"), así que la cadena aparece aunque no haya ningún bloque.
    const vacio = buildSystemPrompt(settings([pack({ content: '   ' })]));
    expect(vacio).not.toContain('Material preparado por la persona');

    const conContenido = buildSystemPrompt(settings([pack({ content: 'algo real' })]));
    expect(conContenido).toContain('Material preparado por la persona');
  });

  it('el perfil personalizado usa el prompt del usuario', () => {
    const prompt = buildSystemPrompt({
      ...DEFAULT_SETTINGS,
      promptProfileId: 'custom',
      customPrompt: 'Eres un pirata.',
    });
    expect(prompt).toContain('Eres un pirata.');
  });
});
