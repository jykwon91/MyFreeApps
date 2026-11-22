import type { DiscardCopy } from "../types/discard/discard-copy";

/** The question a form with unsaved changes asks before it closes, on the website and the phone. */
export const DISCARD_MESSAGES = {
  discardTitle: "Discard your changes?",
  discardBody: "I haven't saved them yet.",
  keepEditing: "Keep editing",
  discard: "Discard",
} as const satisfies DiscardCopy;
