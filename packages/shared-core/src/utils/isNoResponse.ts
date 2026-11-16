/** Statuses RTK Query reports for a call that got no answer: the shared base query leaves it undefined, RTK's own fetch says one of these. */
const NO_RESPONSE_STATUSES: ReadonlySet<unknown> = new Set([undefined, "FETCH_ERROR", "TIMEOUT_ERROR"]);

/** Whether a failed call never got an answer from the server (offline, dropped, or timed out), as opposed to the server refusing it. */
export function isNoResponse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && NO_RESPONSE_STATUSES.has(error.status);
}
