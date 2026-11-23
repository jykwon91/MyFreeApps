/**
 * Something the learner should know about their conversation that isn't a failure.
 * - ``truncated``: a long answer was shortened before it was sent
 * - ``restarted``: the server lost the conversation, so a new one began
 */
export type PracticeNotice = "truncated" | "restarted";
