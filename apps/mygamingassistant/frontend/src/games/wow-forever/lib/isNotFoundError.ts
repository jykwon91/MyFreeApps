/** Whether an RTK Query error is the API's 404. */
export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
