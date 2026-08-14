import { describe, expect, it } from 'vitest';
import { autoTriggerIsInert, DEFAULT_SETTINGS, speakersFor } from '../src/shared/types';

/**
 * Regression of the bug that left the app mute: with `audioSources: 'mic'` the
 * `them` lane isn't even created, so the auto-trigger —which only looks at
 * `them`— discarded every segment silently. No error, no trace, no answer.
 */
describe('autoTriggerIsInert', () => {
  const settings = (patch: Partial<typeof DEFAULT_SETTINGS>): typeof DEFAULT_SETTINGS => ({
    ...DEFAULT_SETTINGS,
    ...patch,
  });

  it('detects the combination that can never fire', () => {
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

  it("doesn't mark as inert what can fire", () => {
    expect(autoTriggerIsInert(DEFAULT_SETTINGS)).toBe(false);

    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'me', autoTriggerMode: 'heuristic' })
      )
    ).toBe(false);

    // `any` is happy with any lane, and there's always at least one.
    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'any', autoTriggerMode: 'heuristic' })
      )
    ).toBe(false);
  });

  it('with the auto-trigger off there is nothing to warn about', () => {
    // Without this early return the dashboard would show a warning about a feature
    // the user has already deliberately disabled.
    expect(
      autoTriggerIsInert(
        settings({ audioSources: 'mic', autoTriggerSpeaker: 'them', autoTriggerMode: 'off' })
      )
    ).toBe(false);
  });

  it('the default keeps listening to the other party', () => {
    // CONTEXT.md §5: precision over recall. Its now being configurable doesn't
    // change the default.
    expect(DEFAULT_SETTINGS.autoTriggerSpeaker).toBe('them');
    expect(speakersFor(DEFAULT_SETTINGS.audioSources)).toContain('them');
  });
});
