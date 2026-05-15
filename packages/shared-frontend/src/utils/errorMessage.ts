/**
 * Normalize an unknown thrown/rejected value into a human-readable string.
 *
 * Critically, this MUST always return a string. FastAPI returns 422
 * validation failures as `{ detail: [{ type, loc, msg, input }, ...] }`.
 * If that array (or its objects) reaches JSX, React throws
 * "Objects are not valid as a React child" and the route crashes. Callers
 * pass the result straight into toasts/JSX, so the array shape is flattened
 * to its `msg` strings here, prefixed with the offending field from `loc`.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.data === "object" && obj.data !== null) {
      const data = obj.data as Record<string, unknown>;
      if (typeof data.detail === "string") return data.detail;
      if (Array.isArray(data.detail)) {
        const msg = formatValidationDetail(data.detail);
        if (msg) return msg;
      }
    }
    if (typeof obj.data === "string") return obj.data;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.detail === "string") return obj.detail;
    if (Array.isArray(obj.detail)) {
      const msg = formatValidationDetail(obj.detail);
      if (msg) return msg;
    }
    if (typeof obj.error === "string") return obj.error;
  }
  return "An unexpected error occurred";
}

/**
 * Flatten a FastAPI/Pydantic 422 `detail` array into one readable string.
 * Each item is `{ type, loc, msg, input }`; `loc` is like `["body", "url"]`.
 * Returns "" when nothing usable is present so the caller can fall through.
 */
function formatValidationDetail(detail: unknown[]): string {
  const parts = detail
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const msg = typeof o.msg === "string" ? o.msg : null;
        if (!msg) return null;
        const loc = Array.isArray(o.loc) ? o.loc : [];
        const field = loc
          .filter((p) => p !== "body" && typeof p !== "number")
          .join(".");
        return field ? `${field}: ${msg}` : msg;
      }
      return null;
    })
    .filter((p): p is string => Boolean(p));
  return parts.join("; ");
}
