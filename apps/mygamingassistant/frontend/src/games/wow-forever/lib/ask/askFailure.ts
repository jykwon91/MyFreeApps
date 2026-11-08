/**
 * Which notice a failed relay call gets. 429s split by `detail`: the daily
 * token caps (Retry-After = UTC midnight), Anthropic being busy (60 s) or the
 * per-address limits; 503 `chat_unavailable` = switched off, other 5xx =
 * failed; Turnstile's `captcha_*` = redo the check; a ticket, round or length
 * problem = this chat is over. No answer at all = network.
 */
import { ASK_ERROR_DETAIL, CHAT_OVER_DETAILS } from "@/games/wow-forever/data/ask/askErrorDetails";
import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import { parseRetryAfter, readHttpError } from "@/games/wow-forever/lib/featureRequests/submitFailure";
import type { AskFailure } from "@/games/wow-forever/types/ask/askFailure";
import type { AskFailureKind } from "@/games/wow-forever/types/ask/askFailureKind";

const RATE_LIMITED_STATUS = 429;
const HUMAN_CHECK_DETAIL = /^captcha/i;
const DAILY_DETAILS: ReadonlySet<string> = new Set([ASK_ERROR_DETAIL.dailyLimit, ASK_ERROR_DETAIL.ipDailyLimit]);

function rateLimitKind(detail: string | null): AskFailureKind {
  if (detail !== null && DAILY_DETAILS.has(detail)) return ASK_FAILURE.dailyLimit;
  if (detail === ASK_ERROR_DETAIL.upstreamBusy) return ASK_FAILURE.busy;
  return ASK_FAILURE.rateLimited;
}

function kindOf(status: number | undefined, detail: string | null): AskFailureKind {
  if (status === undefined) return ASK_FAILURE.network;
  if (status === RATE_LIMITED_STATUS) return rateLimitKind(detail);
  if (detail === ASK_ERROR_DETAIL.unavailable) return ASK_FAILURE.unavailable;
  if (detail !== null && HUMAN_CHECK_DETAIL.test(detail)) return ASK_FAILURE.humanCheck;
  if (detail !== null && CHAT_OVER_DETAILS.has(detail)) return ASK_FAILURE.chatOver;
  if (detail === ASK_ERROR_DETAIL.messageTooLong) return ASK_FAILURE.tooLong;
  return ASK_FAILURE.failed;
}

export function askFailureFrom(err: unknown, now: number = Date.now()): AskFailure {
  const { status, detail, retryAfter } = readHttpError(err);
  const kind = kindOf(status, detail);
  return { kind, retryAfterSeconds: status === RATE_LIMITED_STATUS ? parseRetryAfter(retryAfter, now) : null, at: now };
}
