import type { AnswerTrigger, PromptProfileId } from './types';

/**
 * Which prompt profile a screen action forces for its one shot. `code` needs the
 * coding persona and a higher token cap; `quiz` the terse one-line format;
 * `general` the plain screen-help register. The rest of the triggers carry no
 * forced profile.
 */
export const PROFILE_BY_TRIGGER: Partial<Record<AnswerTrigger, PromptProfileId>> = {
  code: 'coding',
  quiz: 'quiz',
  general: 'general',
};

/**
 * The profile an inherited typed follow-up uses. The quiz is one terse line with
 * no explanation —the opposite of what a follow-up asks for— so it falls back to
 * general help. The interpreter is left as-is on purpose: a typed interpreter
 * conversation is a running translation, and its follow-ups must keep
 * translating, not switch to answering.
 */
function followUpAnsweringProfile(profile: PromptProfileId): PromptProfileId {
  return profile === 'quiz' ? 'general' : profile;
}

/**
 * The profile a turn answers (or translates) with.
 *
 * - A screen action keeps its forced profile.
 * - A TYPED follow-up (`manual-input`) inherits the profile the conversation is
 *   answering with, so continuing a solved screen doesn't snap back to the chip
 *   and —with the interpreter selected— translate the follow-up instead of
 *   answering it. An interpreter conversation keeps translating; a solved-screen
 *   one keeps answering.
 * - Everything else (a listen answer, the first turn, or an explicit chip switch
 *   since the last turn) uses the chip.
 *
 * Pure and in `shared/` so the continuity rules can be pinned with a test — this
 * exact combination has regressed twice.
 */
export function resolveAnswerProfile(input: {
  trigger: AnswerTrigger;
  /** The profile chip currently selected (`settings.promptProfileId`). */
  chip: PromptProfileId;
  /** The profile the ongoing conversation answers with, or null if none yet. */
  conversationProfile: PromptProfileId | null;
  /** The chip value at the last turn, to tell an explicit switch from inheritance. */
  chipAtTurn: PromptProfileId | null;
}): PromptProfileId {
  const forced = PROFILE_BY_TRIGGER[input.trigger];
  if (forced) return forced;

  const userSwitchedChip = input.chipAtTurn !== null && input.chip !== input.chipAtTurn;
  if (input.trigger === 'manual-input' && input.conversationProfile && !userSwitchedChip) {
    return followUpAnsweringProfile(input.conversationProfile);
  }
  return input.chip;
}
