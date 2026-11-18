/**
 * Whether a request was cancelled rather than answered. RTK Query aborts an in-flight request, and
 * rejects it with a serialized "AbortError", when the API cache is reset (sign-out, workspace switch).
 * Nothing was lost in that case: the caller has been moved on from, so there is nothing to tell the user.
 */
export function isCancelledRequest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
