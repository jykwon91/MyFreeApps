/** What the refinement screen says when an answer couldn't be applied, on the website and the phone. */
export const REFINEMENT_FAILURES = {
  /** The suggestion had moved on before the answer arrived; nothing changed, and the current one is reloading. */
  suggestionChanged: "That suggestion had already changed, so nothing was applied. The current one is showing now.",
} as const;
