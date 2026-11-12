/** The HTTP status of a failed discovery call. A dropped connection has none. */
export function discoveryErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}
