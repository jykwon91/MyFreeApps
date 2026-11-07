/**
 * The server answered 429 (too many attempts). Reads the status from an
 * axios error (`err.response.status`) or an RTK Query error (`err.status`).
 */
export function isRateLimitedError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const obj = err as Record<string, unknown>;
  const response = obj.response;
  if (response !== null && typeof response === "object") {
    return (response as Record<string, unknown>).status === 429;
  }
  return obj.status === 429;
}
