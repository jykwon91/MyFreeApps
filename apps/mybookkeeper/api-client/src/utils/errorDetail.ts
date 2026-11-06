/** The `detail` a failed request's body carried, if any. */
export function errorDetail(error: unknown): unknown {
  return (error as { data?: { detail?: unknown } } | null)?.data?.detail;
}
