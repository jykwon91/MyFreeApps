/** How a turn's stream ended, as its events said: a tutor error, and whether ``reply.done`` and ``done`` arrived. */
export interface StreamOutcome {
  error: { code: string; retryable: boolean } | null;
  /** The whole reply arrived; only corrections and the translation were still to come. */
  replyDone: boolean;
  finished: boolean;
}
