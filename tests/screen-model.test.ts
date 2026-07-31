import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/main/core/prompt';
import {
  adviseLocalModels,
  DEFAULT_SETTINGS,
  isScreenTrigger,
  screenModelFor,
  type Settings,
} from '../src/shared/types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('screenModelFor', () => {
  it('por defecto hereda el modelo de respuestas', () => {
    // Es lo que garantiza que quien no toque nada siga teniendo el
    // comportamiento de antes de que este ajuste existiera.
    const target = screenModelFor(settings());
    expect(target).toEqual({ providerId: 'claude', model: 'claude-sonnet-5', inherited: true });
  });

  it('un proveedor propio para la pantalla no toca el de conversar', () => {
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
    // El de conversar sigue intacto.
    expect(current.llmProviderId).toBe('claude');
  });

  it('sin modelo elegido cae al del proveedor en lugar de quedarse vacío', () => {
    // Un campo vacío daría un error del proveedor sobre un ajuste que el
    // usuario no sabe que existe; responder con algo es preferible.
    const target = screenModelFor(
      settings({ screenProviderId: 'gemini', screenModel: '' })
    );
    expect(target.model).toBe('gemini-2.5-flash');
  });

  it('el mismo proveedor puede llevar otro modelo', () => {
    // El caso de Ollama: uno pequeño y rápido para hablar, un multimodal para
    // la pantalla, ambos locales.
    const target = screenModelFor(
      settings({
        llmProviderId: 'ollama',
        llmModels: { claude: 'claude-sonnet-5', gemini: 'gemini-2.5-flash', ollama: 'llama3.2:3b' },
        screenProviderId: 'ollama',
        screenModel: 'qwen2.5vl:7b',
      })
    );
    expect(target.model).toBe('qwen2.5vl:7b');
  });
});

describe('isScreenTrigger', () => {
  it('distingue los disparos de pantalla de los demás', () => {
    expect(isScreenTrigger('code')).toBe(true);
    expect(isScreenTrigger('quiz')).toBe(true);
    expect(isScreenTrigger('hotkey')).toBe(false);
    expect(isScreenTrigger('auto')).toBe(false);
    expect(isScreenTrigger('manual-input')).toBe(false);
  });
});

describe('perfil de test', () => {
  it('trae sus propias reglas, no las de hablar ni las de código', () => {
    const prompt = buildSystemPrompt(settings(), 'quiz');

    expect(prompt).toContain('la letra o el número de la opción');
    expect(prompt).toContain('DUDA:');
    expect(prompt).not.toContain('Máximo 4 viñetas');
    expect(prompt).not.toContain('El código COMPLETO');
  });

  it('avisa de las negaciones del enunciado, que es donde se falla', () => {
    expect(buildSystemPrompt(settings(), 'quiz')).toContain('cuál NO');
  });

  it('el perfil forzado no toca el configurado', () => {
    const current = settings({ promptProfileId: 'interview' });
    expect(buildSystemPrompt(current, 'quiz')).toContain('DUDA:');
    expect(buildSystemPrompt(current)).toContain('Máximo 4 viñetas');
  });
});

describe('adviseLocalModels', () => {
  it('recomienda algo para cada tramo de memoria', () => {
    for (const totalMemoryGB of [4, 8, 16, 32, 64]) {
      const advice = adviseLocalModels({ totalMemoryGB, cpuModel: 'x', cpuCores: 8 });
      expect(advice.chat.model).toBeTruthy();
      expect(advice.vision.model).toBeTruthy();
      expect(advice.caveat).toBeTruthy();
      expect(advice.tier).toContain(String(totalMemoryGB));
    }
  });

  it('a más memoria, no recomienda un modelo más pequeño', () => {
    const poco = adviseLocalModels({ totalMemoryGB: 4, cpuModel: 'x', cpuCores: 4 });
    const mucho = adviseLocalModels({ totalMemoryGB: 64, cpuModel: 'x', cpuCores: 16 });
    expect(poco.chat.model).not.toBe(mucho.chat.model);
  });

  it('con poca memoria dice que lo local no vale para la pantalla', () => {
    // Es la parte honesta de la recomendación: con 4 GB el modelo cabe y aun
    // así se equivoca leyendo capturas, que es lo que hay que advertir.
    const advice = adviseLocalModels({ totalMemoryGB: 4, cpuModel: 'x', cpuCores: 4 });
    expect(advice.caveat).toContain('nube');
  });
});
