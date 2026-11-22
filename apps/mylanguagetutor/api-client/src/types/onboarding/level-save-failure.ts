/**
 * Why saving the level step didn't end in "saved": "failed" when the server refused it or there was nothing to save,
 * "language" when the server didn't accept the language itself (422), so the learner has to choose one again, or
 * "unsure" when the answer was lost (no answer, or a server failure with no reason; see writeOutcome), so it may have saved.
 */
export type LevelSaveFailure = "failed" | "language" | "unsure";
