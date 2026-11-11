/**
 * UI-only state of the suggestion card's input area:
 * - VIEW: showing the AI's proposal / clarification with action buttons
 * - CUSTOM: the user is typing their own rewrite of the current target
 *
 * Hints and clarify answers go through the always-visible composer, not a mode. Not part of the
 * backend session/turn enums.
 */
export const SuggestionMode = {
  VIEW: "view",
  CUSTOM: "custom",
} as const;

export type SuggestionMode = (typeof SuggestionMode)[keyof typeof SuggestionMode];
