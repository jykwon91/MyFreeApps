import type { TriageApiError } from "@/games/wow-forever/types/featureRequests/triage/triageApiError";

/** The detail a missing key gets — the request never left the browser. */
export const DETAIL_LOCKED = "triage_locked";
export const DETAIL_STORY_CHANGED = "story_changed";
export const DETAIL_MERGE_CONFLICT = "merge_conflict";

export function isTriageApiError(value: unknown): value is TriageApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "fields" in value &&
    Array.isArray((value as { fields: unknown }).fields)
  );
}

/** A 429 the caller should wait out (Retry-After seconds, at least 1). Null for any other failure. */
export function rateLimitSeconds(error: unknown): number | null {
  if (!isTriageApiError(error) || error.status !== 429) return null;
  return Math.max(1, error.retryAfterSeconds ?? 1);
}

/** The story field a 422 names: `"title: no links…"` (service) or a pydantic `loc` ending in the field. */
function fieldsFromDetail(detail: unknown): string[] {
  if (typeof detail === "string") {
    const match = /^([a-z_]+):/.exec(detail);
    return match === null ? [] : [match[1]];
  }
  if (!Array.isArray(detail)) return [];
  const fields: string[] = [];
  for (const entry of detail) {
    const loc: unknown = typeof entry === "object" && entry !== null ? (entry as { loc?: unknown }).loc : undefined;
    if (!Array.isArray(loc)) continue;
    const field = loc.find((part, i) => i > 0 && typeof part === "string");
    if (typeof field === "string") fields.push(field);
  }
  return fields;
}

/** The error a failed response becomes. `body` is the parsed JSON, or null. */
export function triageErrorFrom(status: number | null, body: unknown, retryAfterSeconds: number | null): TriageApiError {
  const detail: unknown = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : undefined;
  return {
    status,
    detail: typeof detail === "string" ? detail : null,
    fields: status === 422 ? fieldsFromDetail(detail) : [],
    retryAfterSeconds,
  };
}
