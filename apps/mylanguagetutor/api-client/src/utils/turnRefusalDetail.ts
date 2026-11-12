/**
 * The refusal code of a turn request answered with an HTTP error: the backend's
 * string ``detail`` when the body has one, else ``http_<status>``. ``body`` is the
 * parsed JSON body, or ``undefined`` when it wasn't JSON.
 */
export function turnRefusalDetail(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `http_${status}`;
}
