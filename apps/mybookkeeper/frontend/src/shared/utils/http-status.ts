/** True when an RTK Query (or fetch-like) error carries the given HTTP status. */
export function hasHttpStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === status;
}
