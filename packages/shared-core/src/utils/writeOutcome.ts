import type { WriteOutcome } from "../types/write/write-outcome";
import { getApiValidationDetail } from "./apiValidationDetail";
import { httpStatus } from "./httpStatus";

/**
 * Whether a failed write could still have gone through. Matters most for a create: no request carries
 * an idempotency key, so sending it again after an "unknown" can make two.
 *
 * - No numeric status means no answer: the request may have reached the server before the connection
 *   dropped or the phone gave up waiting.
 * - A 5xx without the app's own `detail` comes from a crash or the proxy (a 502/504 HTML page), which
 *   can happen after the database committed.
 * - A 5xx with a `detail` is the app refusing on purpose (storage not configured, a model call failed),
 *   and so is every 4xx. The few endpoints whose 5xx detail means "maybe done" (sending a reply or a
 *   receipt) read that detail themselves.
 */
export function writeOutcome(error: unknown): WriteOutcome {
  const status = httpStatus(error);
  if (typeof status !== "number") return "unknown";
  if (status < 500) return "notSaved";
  return getApiValidationDetail(error, "") === "" ? "unknown" : "notSaved";
}
