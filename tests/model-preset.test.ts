import { describe, expect, it } from 'vitest';
import {
  applyModelPreset,
  DEFAULT_SETTINGS,
  presetFromSettings,
  type ModelPreset,
  type Settings,
} from '../src/shared/types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

const preset = (patch: Partial<ModelPreset> = {}): ModelPreset => ({
  id: 'p1',
  name: 'Entrevista',
  sttProviderId: 'whisper-local',
  whisperModel: 'small',
  llmProviderId: 'ollama',
  llmModel: 'llama3.1:8b',
  screenProviderId: 'same',
  screenModel: '',
  promptProfileId: 'interview',
  ...patch,
});

describe('applyModelPreset', () => {
  it("sets the preset's engines, models and profile", () => {
    const patch = applyModelPreset(settings(), preset());
    expect(patch.sttProviderId).toBe('whisper-local');
    expect(patch.whisperModel).toBe('small');
    expect(patch.llmProviderId).toBe('ollama');
    expect(patch.screenProviderId).toBe('same');
    expect(patch.promptProfileId).toBe('interview');
  });

  it("overwrites only the preset provider's model and keeps the rest", () => {
    // The delicate part: `llmModels` is a per-provider Record. Switching to Ollama
    // can't forget the Claude model the user chose back in the day.
    const current = settings({
      llmModels: {
        claude: 'claude-opus-4-8',
        gemini: 'gemini-3.6-flash',
        openai: 'gpt-5.6-terra',
        deepseek: 'deepseek-v4-flash',
        ollama: '',
      },
    });

    const patch = applyModelPreset(current, preset({ llmProviderId: 'ollama', llmModel: 'llama3.1:8b' }));

    expect(patch.llmModels).toEqual({
      claude: 'claude-opus-4-8',
      gemini: 'gemini-3.6-flash',
      openai: 'gpt-5.6-terra',
      deepseek: 'deepseek-v4-flash',
      ollama: 'llama3.1:8b',
    });
  });

  it("doesn't touch settings outside its scope (language, sources, skill)", () => {
    const patch = applyModelPreset(settings(), preset());
    expect(patch).not.toHaveProperty('language');
    expect(patch).not.toHaveProperty('audioSources');
    expect(patch).not.toHaveProperty('activeSkillId');
    expect(patch).not.toHaveProperty('autoTriggerSensitivity');
  });
});

describe('presetFromSettings', () => {
  it('captures what a preset governs, without id or name', () => {
    const current = settings({
      sttProviderId: 'whisper-local',
      whisperModel: 'medium',
      llmProviderId: 'claude',
      screenProviderId: 'ollama',
      screenModel: 'qwen2.5vl:7b',
      promptProfileId: 'meeting',
    });

    const captured = presetFromSettings(current);
    expect(captured).not.toHaveProperty('id');
    expect(captured).not.toHaveProperty('name');
    expect(captured.llmModel).toBe(current.llmModels.claude);
    expect(captured.screenModel).toBe('qwen2.5vl:7b');
    expect(captured.promptProfileId).toBe('meeting');
  });

  it('capturing and re-applying leaves the governed fields unchanged', () => {
    const current = settings({
      sttProviderId: 'whisper-local',
      whisperModel: 'small',
      llmProviderId: 'gemini',
      promptProfileId: 'lecture',
    });

    const roundTrip = { ...current, ...applyModelPreset(current, { id: 'x', name: 'n', ...presetFromSettings(current) }) };
    expect(roundTrip.sttProviderId).toBe(current.sttProviderId);
    expect(roundTrip.whisperModel).toBe(current.whisperModel);
    expect(roundTrip.llmProviderId).toBe(current.llmProviderId);
    expect(roundTrip.llmModels).toEqual(current.llmModels);
    expect(roundTrip.promptProfileId).toBe(current.promptProfileId);
  });
});
