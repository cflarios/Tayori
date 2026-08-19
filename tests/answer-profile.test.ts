import { describe, expect, it } from 'vitest';
import { resolveAnswerProfile } from '../src/shared/answer-profile';

describe('resolveAnswerProfile', () => {
  it('a screen action keeps its forced profile, whatever the chip says', () => {
    const chip = 'interpreter' as const;
    expect(resolveAnswerProfile({ trigger: 'code', chip, conversationProfile: null, chipAtTurn: null })).toBe(
      'coding'
    );
    expect(resolveAnswerProfile({ trigger: 'quiz', chip, conversationProfile: null, chipAtTurn: null })).toBe(
      'quiz'
    );
    expect(
      resolveAnswerProfile({ trigger: 'general', chip, conversationProfile: null, chipAtTurn: null })
    ).toBe('general');
  });

  it('the first typed turn uses the chip', () => {
    expect(
      resolveAnswerProfile({
        trigger: 'manual-input',
        chip: 'interpreter',
        conversationProfile: null,
        chipAtTurn: null,
      })
    ).toBe('interpreter');
  });

  it('a typed interpreter conversation keeps translating — the regression', () => {
    // Turn 2+ of a typed interpreter chat must NOT snap to answering.
    expect(
      resolveAnswerProfile({
        trigger: 'manual-input',
        chip: 'interpreter',
        conversationProfile: 'interpreter',
        chipAtTurn: 'interpreter',
      })
    ).toBe('interpreter');
  });

  it('a follow-up after a solved screen answers, even under the interpreter chip', () => {
    // The solve forced 'coding'; the typed follow-up inherits it and answers.
    expect(
      resolveAnswerProfile({
        trigger: 'manual-input',
        chip: 'interpreter',
        conversationProfile: 'coding',
        chipAtTurn: 'interpreter',
      })
    ).toBe('coding');
  });

  it('a follow-up to a quiz explains instead of staying terse', () => {
    expect(
      resolveAnswerProfile({
        trigger: 'manual-input',
        chip: 'interpreter',
        conversationProfile: 'quiz',
        chipAtTurn: 'interpreter',
      })
    ).toBe('general');
  });

  it('an explicit chip switch since the last turn wins over inheritance', () => {
    expect(
      resolveAnswerProfile({
        trigger: 'manual-input',
        chip: 'meeting',
        conversationProfile: 'coding',
        chipAtTurn: 'interpreter',
      })
    ).toBe('meeting');
  });

  it('a listen answer (auto/hotkey) uses the chip, never inheritance', () => {
    expect(
      resolveAnswerProfile({
        trigger: 'auto',
        chip: 'interpreter',
        conversationProfile: 'coding',
        chipAtTurn: 'coding',
      })
    ).toBe('interpreter');
  });
});
