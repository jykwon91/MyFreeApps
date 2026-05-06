/**
 * Routing helpers for the JD URL extraction error responses.
 *
 * The backend returns a small, stable set of HTTP statuses for the
 * `POST /applications/extract-from-url` endpoint:
 *
 * - 422 + `{detail: "auth_required"}` — URL is auth-walled (LinkedIn,
 *   Glassdoor) or returned a near-empty body. UI should switch to the
 *   "paste text" affordance.
 * - 504 — upstream timeout. Surfaced as a normal error.
 * - 502 — upstream HTTP error or AI extraction failed.
 * - 429 — per-IP rate limit exceeded.
 * - 400 — malformed URL (Pydantic AnyHttpUrl rejects it).
 *
 * RTK Query surfaces errors as `{ status: number; data: unknown }`. We
 * read both fields defensively because `unknown` covers a string error
 * message (axios timeouts) and a structured FastAPI body
 * (`{detail: ...}`).
 *
 * Keeping this routing in one place — instead of inlined in the dialog
 * — means the dialog file's switch statement stays small and the rules
 * are easy to test in isolation.
 */

interface ApiErrorShape {
  status?: number;
  data?: unknown;
}

/**
 * Returns true when the error is the backend's "auth_required" response —
 * HTTP 422 with `{detail: "auth_required"}` — meaning the URL is
 * auth-walled or returned a near-empty body. The UI should switch the
 * user to the paste-text tab rather than show a generic error.
 */
export function isAuthRequiredError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as ApiErrorShape;
  if (e.status !== 422) return false;
  if (typeof e.data !== "object" || e.data === null) return false;
  const data = e.data as Record<string, unknown>;
  return data.detail === "auth_required";
}

/**
 * User-friendly message for non-auth-required failures of the URL
 * extractor. Falls back to a generic message when the error shape is
 * unrecognised.
 */
export function describeExtractError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as ApiErrorShape;
    if (e.status === 504) {
      return "The page took too long to load. Try again or paste the description text.";
    }
    if (e.status === 502) {
      return "Couldn't extract the job description from that page. Paste the description text instead.";
    }
    if (e.status === 429) {
      return "Too many requests. Wait a few minutes and try again.";
    }
    if (e.status === 400) {
      return "That URL doesn't look right. Make sure it starts with http:// or https://.";
    }
  }
  return "Couldn't fetch that URL. Paste the description text instead.";
}
