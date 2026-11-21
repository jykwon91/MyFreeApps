import { REMINDER_MAY_HAVE_BEEN_SENT_CODE } from "../constants/rentReminderErrorCodes";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/**
 * The server's words when Send now refused because the last try may have
 * reached the tenant and resending wasn't confirmed; `null` for any other error.
 */
export function mayHaveBeenSentRefusalMessage(error: unknown): string | null {
  if (httpStatus(error) !== 409) return null;
  const detail = errorDetail(error) as { code?: unknown; message?: unknown } | undefined;
  if (detail?.code !== REMINDER_MAY_HAVE_BEEN_SENT_CODE) return null;
  return typeof detail.message === "string" ? detail.message : "";
}
