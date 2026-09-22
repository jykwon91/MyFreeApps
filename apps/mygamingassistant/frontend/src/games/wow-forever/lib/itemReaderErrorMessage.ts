import { extractErrorMessage } from "@platform/ui";

const MANUAL_FALLBACK = "You can also paste tooltip text copied from a website.";

/** Backend detail codes → what the user should do next. */
const MESSAGES_BY_DETAIL: Readonly<Record<string, string>> = {
  item_reader_unavailable: `Screenshot reading isn't switched on right now. ${MANUAL_FALLBACK}`,
  item_reader_daily_limit_reached: `The screenshot reader has used up today's budget (it resets at midnight UTC). ${MANUAL_FALLBACK}`,
  captcha_expired_please_retry: "The human check expired. Complete it again, then read the screenshot.",
  captcha_verification_failed: "The human check didn't pass. Complete it again, then read the screenshot.",
  captcha_service_misconfigured: `Screenshot reading is temporarily unavailable. ${MANUAL_FALLBACK}`,
  "Captcha token required": "Complete the human check first, then read the screenshot.",
  // Per-IP limit (platform_shared RATE_LIMIT_GENERIC_DETAIL).
  "Too many attempts": `You've read a lot of screenshots in the last hour. Try again later, or ${MANUAL_FALLBACK.toLowerCase()}`,
};

/** A user-facing message for a failed item-reader call. */
export function itemReaderErrorMessage(err: unknown): string {
  const detail = extractErrorMessage(err);
  return MESSAGES_BY_DETAIL[detail] ?? detail;
}
