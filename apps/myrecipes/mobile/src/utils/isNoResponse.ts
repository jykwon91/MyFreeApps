/**
 * A request that never got an answer: offline, timed out, or the server unreachable. The base
 * query leaves the status out then, while a thrown bug has no status key at all.
 */
export function isNoResponse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === undefined;
}
