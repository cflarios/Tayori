import { describe, expect, it } from 'vitest';
import {
  matchSkills,
  parseSkillFile,
  parseSkillInvocation,
  skillIdFromFolder,
} from '../src/shared/skills';
import { buildSystemPrompt } from '../src/main/core/prompt';
import {
  DEFAULT_SETTINGS,
  providerIsReady,
  type SecretsPresence,
  type Settings,
  type Skill,
} from '../src/shared/types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

const skill = (patch: Partial<Skill> = {}): Skill => ({
  id: 'humanizar',
  name: 'Que no suene a IA',
  description: 'Quita las marcas de texto generado.',
  instructions: 'Nunca escribas "es importante destacar".',
  builtIn: false,
  ...patch,
});

/**
 * The SKILL.md parser.
 *
 * It's the place where a failure shows little: a badly read frontmatter doesn't
 * blow up, it produces a skill with the description tucked inside the
 * instructions or the other way around, and that reaches the model without
 * anything saying so.
 */
describe('parseSkillFile', () => {
  it('separates the frontmatter from the body', () => {
    const parsed = parseSkillFile(
      ['---', 'name: Humanizar', 'description: Que no suene a IA.', '---', '', 'No uses jerga.'].join(
        '\n'
      ),
      'humanizar'
    );

    expect(parsed.name).toBe('Humanizar');
    expect(parsed.description).toBe('Que no suene a IA.');
    expect(parsed.instructions).toBe('No uses jerga.');
    expect(parsed.error).toBeUndefined();
  });

  it('joins a description split across several lines', () => {
    // A real `description` doesn't fit in 80 columns, and whoever writes the file
    // is going to split it. Without this, the second line would disappear.
    const parsed = parseSkillFile(
      ['---', 'name: X', 'description: Primera parte', '  y la continuación.', '---', 'Cuerpo.'].join(
        '\n'
      ),
      'x'
    );

    expect(parsed.description).toBe('Primera parte y la continuación.');
  });

  it("ignores keys it doesn't know instead of failing", () => {
    // A SKILL.md written for another tool brings extra fields (license,
    // allowed-tools…). Rejecting it for that would break compatibility with the
    // format we've chosen to follow.
    const parsed = parseSkillFile(
      ['---', 'name: X', 'license: GPL-3.0', 'allowed-tools: none', '---', 'Cuerpo.'].join('\n'),
      'x'
    );

    expect(parsed.name).toBe('X');
    expect(parsed.error).toBeUndefined();
  });

  it('tolerates the BOM and the Windows line breaks', () => {
    // A file created with Notepad brings both, and with the BOM in front the
    // opening `---` stops matching: the whole skill would fall over with no
    // visible reason.
    const parsed = parseSkillFile('﻿---\r\nname: X\r\n---\r\nCuerpo.\r\n', 'x');

    expect(parsed.name).toBe('X');
    expect(parsed.instructions).toBe('Cuerpo.');
  });

  it('removes the quotes of a quoted value', () => {
    const parsed = parseSkillFile(['---', 'name: "X: con dos puntos"', '---', 'Cuerpo.'].join('\n'), 'x');
    expect(parsed.name).toBe('X: con dos puntos');
  });

  it('with no frontmatter it errors instead of swallowing the whole file', () => {
    const parsed = parseSkillFile('Sólo instrucciones, sin cabecera.', 'x');
    expect(parsed.error).toBeTruthy();
  });

  it('an empty body is an error, even if the frontmatter is fine', () => {
    // It's the only failure that really matters: a skill without instructions does
    // NOTHING, and would appear on in the dropdown saying the opposite.
    const parsed = parseSkillFile(['---', 'name: X', 'description: Y', '---', ''].join('\n'), 'x');
    expect(parsed.error).toBeTruthy();
  });

  it("with no name it uses the folder's id, and that's not an error", () => {
    const parsed = parseSkillFile(['---', 'description: Y', '---', 'Cuerpo.'].join('\n'), 'mi-skill');
    expect(parsed.name).toBe('mi-skill');
    expect(parsed.error).toBeUndefined();
  });
});

describe('skillIdFromFolder', () => {
  it('normalizes the folder name', () => {
    expect(skillIdFromFolder('Humanizar Texto')).toBe('humanizar-texto');
    expect(skillIdFromFolder('  QUIZ_helper  ')).toBe('quiz_helper');
  });

  it("doesn't leave stray dashes at the ends", () => {
    // They're typed after the slash: `/-mi-skill-` would be impossible to guess.
    expect(skillIdFromFolder('¡Mi Skill!')).toBe('mi-skill');
  });
});

/**
 * The `/skill` prefix.
 *
 * What's protected here isn't the good case, it's the bad one: an invocation
 * recognized when it shouldn't be eats the first word of the question, and the
 * model answers something else without anything warning of it.
 */
describe('parseSkillInvocation', () => {
  const known = [{ id: 'humanizar' }, { id: 'quiz' }];

  it('separates the skill from the question', () => {
    expect(parseSkillInvocation('/humanizar explícame Kubernetes', known)).toEqual({
      skillId: 'humanizar',
      text: 'explícame Kubernetes',
    });
  });

  it('also accepts $, because on some keyboards the slash is awkward', () => {
    expect(parseSkillInvocation('$quiz ¿cuál es la respuesta?', known).skillId).toBe('quiz');
  });

  it("does NOT touch the text if the skill doesn't exist", () => {
    // The case that justifies the check: without it, "/etc" would be taken for an
    // invocation and the question would lose its first word.
    expect(parseSkillInvocation('/etc está lleno de configuración', known)).toEqual({
      text: '/etc está lleno de configuración',
    });
  });

  it('a skill with no question after it leaves the text empty', () => {
    // It's still valid: it answers whatever is in the transcript, with the skill
    // set.
    expect(parseSkillInvocation('/humanizar', known)).toEqual({ skillId: 'humanizar', text: '' });
  });

  it("doesn't confuse a slash in the middle of the sentence", () => {
    expect(parseSkillInvocation('qué opinas de /humanizar', known).skillId).toBeUndefined();
  });
});

describe('matchSkills', () => {
  const all = [skill(), skill({ id: 'quiz', name: 'Modo examen' })];

  it("returns null if nothing is being invoked", () => {
    // `null` and empty list mean different things: without that difference, the
    // menu couldn't say "there's none by that name".
    expect(matchSkills('hola qué tal', all)).toBeNull();
  });

  it('with only the slash it offers all', () => {
    expect(matchSkills('/', all)).toHaveLength(2);
  });

  it('filters by id and by name', () => {
    expect(matchSkills('/hum', all)?.map((s) => s.id)).toEqual(['humanizar']);
    expect(matchSkills('/examen', all)?.map((s) => s.id)).toEqual(['quiz']);
  });

  it("doesn't offer a broken skill", () => {
    // Choosing it would do nothing, because `getSkill` discards it anyway.
    const rota = [skill({ id: 'rota', error: 'sk.errNoBody' })];
    expect(matchSkills('/', rota)).toHaveLength(0);
  });

  it('stops offering as soon as there is a space', () => {
    // With a space the question is already being written, not the name.
    expect(matchSkills('/humanizar explica', all)).toBeNull();
  });
});

/**
 * The skill inside the prompt.
 *
 * The distribution of authority is what makes this work, and it's exactly what a
 * refactor can throw away without any test noticing: a skill that merely
 * concatenates itself loses against format rules that carry the word "mandatory"
 * on top.
 */
describe('buildSystemPrompt with a skill', () => {
  it("doesn't change anything if there's no skill", () => {
    expect(buildSystemPrompt(settings())).toBe(buildSystemPrompt(settings(), undefined, undefined));
  });

  it("puts in the skill's instructions", () => {
    const prompt = buildSystemPrompt(settings(), undefined, skill());
    expect(prompt).toContain('Nunca escribas "es importante destacar"');
    expect(prompt).toContain('Que no suene a IA');
  });

  it('goes last, even after the context', () => {
    // It's the position the model attends to most strongly, and a skill exists to
    // correct the manner of writing the rules above bring.
    const prompt = buildSystemPrompt(
      settings({
        contextPacks: [
          {
            id: '1',
            name: 'CV',
            content: 'Diez años de backend.',
            enabled: true,
            kind: 'cv',
            profiles: [],
          },
        ],
      }),
      undefined,
      skill()
    );

    expect(prompt.indexOf('<instruccion_activa>')).toBeGreaterThan(prompt.indexOf('</contexto>'));
  });

  it('declares the split: it rules the manner, not the shape', () => {
    // Without this, a tone skill and format rules contradict each other and the
    // tie is broken by the model in silence — different depending on the provider
    // and on the sentence, which is the worst kind of behavior.
    const prompt = buildSystemPrompt(settings(), undefined, skill());

    expect(prompt).toContain('NO cambia el formato');
    expect(prompt).toContain('gana la regla de formato');
    // And the profile's rules are still there in full.
    expect(prompt).toContain('Máximo 4 viñetas');
  });

  it("coexists with code mode's forced profile", () => {
    const prompt = buildSystemPrompt(settings(), 'coding', skill());
    expect(prompt).toContain('El código COMPLETO');
    expect(prompt).toContain('<instruccion_activa>');
  });

  it("a skill without instructions doesn't add a block", () => {
    // An empty `<instruccion_activa>` would tell the model there's an active
    // instruction without saying which, which is worse than saying nothing.
    const prompt = buildSystemPrompt(settings(), undefined, skill({ instructions: '   ' }));
    expect(prompt).not.toContain('<instruccion_activa>');
  });
});

/**
 * «Can the chosen provider answer?»
 *
 * Three screens made this calculation separately, each with its own `if` chain,
 * and none broke the build when adding a provider: the chain fell to the last
 * case and answered for another. The real symptom was the worst of theirs — the
 * overlay saying «The AI needs configuring» with the AI configured.
 */
describe('providerIsReady', () => {
  const presence = (patch: Partial<SecretsPresence> = {}): SecretsPresence => ({
    anthropic: false,
    google: false,
    openai: false,
    deepseek: false,
    mqtt: false,
    ...patch,
  });

  it("each provider looks at ITS credential and not the neighbor's", () => {
    expect(providerIsReady(settings({ llmProviderId: 'claude' }), presence({ anthropic: true }))).toBe(true);
    expect(providerIsReady(settings({ llmProviderId: 'claude' }), presence({ google: true }))).toBe(false);
    expect(providerIsReady(settings({ llmProviderId: 'openai' }), presence({ openai: true }))).toBe(true);
    expect(providerIsReady(settings({ llmProviderId: 'openai' }), presence({ anthropic: true }))).toBe(false);
    expect(providerIsReady(settings({ llmProviderId: 'gemini' }), presence({ google: true }))).toBe(true);
  });

  it("a key missing in ANOTHER provider doesn't turn off the chosen one", () => {
    // The exact case of the failure: with Ollama set and a model chosen, not
    // having an OpenAI key has no reason to say anything.
    const current = settings({
      llmProviderId: 'ollama',
      llmModels: { ...DEFAULT_SETTINGS.llmModels, ollama: 'qwen2.5vl:latest' },
    });
    expect(providerIsReady(current, presence())).toBe(true);
  });

  it("Ollama doesn't need a key, but it does need a model", () => {
    // Without a model, every question fails with "no model selected", and before
    // that case passed as configured without showing any warning.
    const sinModelo = settings({
      llmProviderId: 'ollama',
      llmModels: { ...DEFAULT_SETTINGS.llmModels, ollama: '' },
    });
    expect(providerIsReady(sinModelo, presence({ anthropic: true }))).toBe(false);
  });
});
