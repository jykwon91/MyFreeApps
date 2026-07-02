/**
 * UI-only state machine for the suggestion card's input area:
 * - VIEW: showing the AI's proposal / clarification with action buttons
 * - CUSTOM: user is typing their own rewrite of the current target
 *
 * The old ALTERNATIVE mode folded into the always-visible chat
 * composer (SuggestionComposer) — hints and clarify answers are plain
 * chat messages now, not a separate panel.
 *
 * Local to the resume-refinement feature; not part of the backend
 * session/turn enum.
 */
export const SuggestionMode = {
  VIEW: "view",
  CUSTOM: "custom",
} as const;

export type SuggestionMode = (typeof SuggestionMode)[keyof typeof SuggestionMode];
