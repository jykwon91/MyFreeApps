/** The HTTP status of a failed request, or undefined when no answer came back. */
export function httpStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error ? (error.status as number | undefined) : undefined;
}
