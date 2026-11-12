import type { RefinementCompletion } from "../types/resume-refinement/refinement-completion";
import type { RefinementCompletionCopy } from "../types/resume-refinement/refinement-completion-copy";

/** The finishing panel's words for each state it shows in. */
export const REFINEMENT_COMPLETION_COPY: Record<Exclude<RefinementCompletion, "hidden">, RefinementCompletionCopy> = {
  reviewed: {
    heading: "All targets reviewed",
    body: "You've gone through every suggestion. Mark the session done to lock the draft, then download.",
  },
  // The review found nothing to change: still a legitimately done resume, but the words
  // shouldn't claim the user reviewed anything.
  empty: {
    heading: "Nothing to flag",
    body: "We reviewed your draft and didn't find anything worth changing this pass. Mark it done as-is, or make some edits elsewhere and start a fresh session.",
  },
  completed: {
    heading: "All done",
    body: "Your refined resume is ready to download in either format.",
  },
};
