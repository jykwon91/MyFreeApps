/**
 * Why saving the level step didn't end in "saved": "failed" when the server refused it or there was nothing to save, or
 * "unsure" when the answer was lost (no answer, or a server failure with no reason; see writeOutcome), so it may have saved.
 */
export type LevelSaveFailure = "failed" | "unsure";
