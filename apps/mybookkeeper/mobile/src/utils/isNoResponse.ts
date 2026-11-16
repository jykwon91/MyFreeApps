/** A request that got no answer at all: offline, or the server couldn't be reached. An HTTP error isn't one. */
export function isNoResponse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === undefined;
}
