/** How a turn's stream ended, as its events said: a tutor error, and whether ``done`` arrived. */
export interface StreamOutcome {
  error: { code: string; retryable: boolean } | null;
  finished: boolean;
}
