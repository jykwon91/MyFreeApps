/**
 * What the form says when `POST /api/wow/feature-requests` fails.
 *
 * 503 (`feature_requests_unavailable`, `feature_inbox_full`) — paused; 429 — the per-address limit, with
 * Retry-After when the server sends one; Turnstile's `captcha_*` codes — redo the human check; 400/422 — too
 * short to understand; no answer at all (offline, timeout) — network; anything else — server.
 */
import { SUBMIT_PROBLEM } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import type { SubmitFailure } from "@/games/wow-forever/types/featureRequests/submitFailure";

const UNAVAILABLE_STATUS = 503;
const RATE_LIMITED_STATUS = 429;
const BAD_INPUT_STATUSES: ReadonlySet<number> = new Set([400, 422]);
/** platform_shared's Turnstile dependency answers with these details (plus "Captcha token required"). */
const HUMAN_CHECK_DETAIL = /^captcha|captcha token required/i;

interface HttpErrorShape {
  status: number | undefined;
  detail: string | null;
  retryAfter: string | null;
}

/** Status, `detail` and Retry-After from an axios rejection; all empty for anything else. */
export function readHttpError(err: unknown): HttpErrorShape {
  const empty: HttpErrorShape = { status: undefined, detail: null, retryAfter: null };
  if (typeof err !== "object" || err === null) return empty;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return empty;
  const r = response as { status?: unknown; data?: unknown; headers?: unknown };
  const status = typeof r.status === "number" ? r.status : undefined;
  const data = r.data as { detail?: unknown } | null | undefined;
  const detail = typeof data?.detail === "string" ? data.detail : null;
  return { status, detail, retryAfter: retryAfterHeader(r.headers) };
}

function retryAfterHeader(headers: unknown): string | null {
  if (typeof headers !== "object" || headers === null) return null;
  const h = headers as { get?: (name: string) => unknown; [key: string]: unknown };
  const value = typeof h.get === "function" ? h.get("retry-after") : (h["retry-after"] ?? h["Retry-After"]);
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** Seconds to wait from a Retry-After value (delta-seconds or an HTTP date), or null when unusable. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

export function submitFailureFrom(err: unknown, now: number = Date.now()): SubmitFailure {
  const { status, detail, retryAfter } = readHttpError(err);
  const failure = (kind: SubmitFailure["kind"]): SubmitFailure => ({ kind, retryAfterSeconds: null });
  if (status === undefined) return failure(SUBMIT_PROBLEM.network);
  if (status === RATE_LIMITED_STATUS) {
    return { kind: SUBMIT_PROBLEM.rateLimited, retryAfterSeconds: parseRetryAfter(retryAfter, now) };
  }
  if (status === UNAVAILABLE_STATUS) return failure(SUBMIT_PROBLEM.unavailable);
  if (detail !== null && HUMAN_CHECK_DETAIL.test(detail)) return failure(SUBMIT_PROBLEM.humanCheck);
  if (BAD_INPUT_STATUSES.has(status)) return failure(SUBMIT_PROBLEM.tooShort);
  return failure(SUBMIT_PROBLEM.server);
}
