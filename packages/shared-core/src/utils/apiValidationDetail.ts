const VALUE_ERROR_PREFIX = /^Value error,\s*/;

/**
 * The server's own explanation of a rejected write: a plain `detail` string, or FastAPI's 422 list
 * (`detail: [{ msg }]`) joined into one sentence. `fallback` when there is nothing usable.
 */
export function getApiValidationDetail(error: unknown, fallback: string): string {
  const detail = (error as { data?: { detail?: unknown } } | undefined)?.data?.detail;
  if (typeof detail === "string") return detail.trim() !== "" ? detail : fallback;
  if (!Array.isArray(detail)) return fallback;
  const messages = detail
    .map((item) => (item as { msg?: unknown } | null)?.msg)
    .filter((msg): msg is string => typeof msg === "string" && msg.trim() !== "")
    .map((msg) => msg.replace(VALUE_ERROR_PREFIX, ""));
  return messages.length > 0 ? messages.join(" ") : fallback;
}
