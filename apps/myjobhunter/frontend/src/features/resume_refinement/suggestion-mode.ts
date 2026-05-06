/**
 * UI-only state machine for the suggestion card's input area:
 * - VIEW: showing the AI's proposal / clarification with action buttons
 * - CUSTOM: user is typing their own rewrite of the current target
 * - ALTERNATIVE: user is asking the AI to regenerate with an optional hint
 *
 * Local to the resume-refinement feature; not part of the backend
 * session/turn enum.
 */
export const SuggestionMode = {
  VIEW: "view",
  CUSTOM: "custom",
  ALTERNATIVE: "alternative",
} as const;

export type SuggestionMode = (typeof SuggestionMode)[keyof typeof SuggestionMode];
