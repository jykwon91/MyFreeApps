/**
 * Extract a human-displayable message from an unknown thrown value.
 *
 * Handles the error shapes this codebase produces:
 *   - **axios** rejections — the server body is at ``err.response.data``
 *     and ``err`` is itself an ``Error`` whose ``.message`` is the
 *     useless ``"Request failed with status code 400"``.
 *   - **RTK Query** (``fetchBaseQuery``) — the body is at ``err.data``.
 *   - plain ``Error`` / string — used by some call sites and tests.
 *
 * The structured server ``detail`` is read BEFORE the ``Error.message``
 * fallback. An ``AxiosError`` *is* an ``Error``, so a naive
 * ``err instanceof Error`` check first would always return
 * ``"Request failed with status code 400"`` and never surface the
 * server's ``{detail: ...}`` body (this was the registration
 * "generic 400" bug).
 *
 * This MUST always return a string. FastAPI 422 validation failures
 * arrive as ``{ detail: [{ type, loc, msg, input }, ...] }``; if that
 * array (or its objects) reaches JSX, React throws "Objects are not
 * valid as a React child" and the route crashes. The array is flattened
 * to its ``msg`` strings (prefixed with the offending ``loc`` field)
 * via ``formatValidationDetail``.
 */

function readDetail(data: unknown): string | undefined {
  if (typeof data === "string") return data.trim() || undefined;
  if (data !== null && typeof data === "object") {
    const detail = (data as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail.trim() || undefined;
    if (Array.isArray(detail)) {
      const msg = formatValidationDetail(detail);
      if (msg) return msg;
    }
  }
  return undefined;
}

export function extractErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;

  if (err !== null && typeof err === "object") {
    const obj = err as Record<string, unknown>;

    // axios: server body lives under err.response.data
    const response = obj.response;
    if (response !== null && typeof response === "object") {
      const fromResponse = readDetail(
        (response as Record<string, unknown>).data,
      );
      if (fromResponse) return fromResponse;
    }

    // RTK Query fetchBaseQuery: { status, data: { detail } | string }
    const fromData = readDetail(obj.data);
    if (fromData) return fromData;

    if (typeof obj.detail === "string" && obj.detail.trim()) {
      return obj.detail;
    }
    if (Array.isArray(obj.detail)) {
      const msg = formatValidationDetail(obj.detail);
      if (msg) return msg;
    }
    if (typeof obj.error === "string" && obj.error.trim()) {
      return obj.error;
    }

    // Only now fall back to a raw Error.message — for an AxiosError
    // this is the unhelpful "Request failed with status code N", so it
    // must come AFTER the structured-detail extraction above.
    if (err instanceof Error && err.message) return err.message;
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
  }

  if (err instanceof Error && err.message) return err.message;
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
