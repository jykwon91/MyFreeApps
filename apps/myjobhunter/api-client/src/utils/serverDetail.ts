/** The server's own reason for a failed request, when it gave one as a plain string; otherwise null. */
export function serverDetail(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const { data } = error;
  if (typeof data !== "object" || data === null || !("detail" in data)) return null;
  const { detail } = data;
  return typeof detail === "string" && detail.trim() !== "" ? detail.trim() : null;
}
