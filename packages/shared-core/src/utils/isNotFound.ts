/** Whether an RTK Query error is the API's 404: the record isn't there, so retrying won't help. */
export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
