/** A lease 409 carries `detail: { code, message }`, and the message is a developer string. */
export function leaseConflictCode(error: unknown): string | null {
  const detail = (error as { data?: { detail?: { code?: unknown } } } | null)?.data?.detail;
  return typeof detail?.code === "string" ? detail.code : null;
}
