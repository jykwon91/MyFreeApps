import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { RENT_MANAGE_MESSAGES } from "../../constants/rentManage";
import { REMINDER_SETUP_MESSAGES } from "../../constants/rentReminderSetup";

export type RentWrite = "schedule" | "charge" | "other";

/**
 * The server's own wording can be a developer string, so it's never shown.
 * A lost answer or a proxy error can come after the save (see writeOutcome): a retry could add a second charge or schedule, so it says to check first.
 */
function commonFailure(error: unknown): string | null {
  if (writeOutcome(error) === "unknown") return RENT_MANAGE_MESSAGES.unsure;
  switch (httpStatus(error)) {
    case 403:
      return isDemoRefusal(error) ? RENT_MANAGE_MESSAGES.demo : RENT_MANAGE_MESSAGES.viewOnly;
    case 404:
      return RENT_MANAGE_MESSAGES.gone;
    default:
      return null;
  }
}

export function rentWriteFailure(error: unknown, write: RentWrite): string {
  const common = commonFailure(error);
  if (common) return common;
  const status = httpStatus(error);
  if (write === "schedule" && status === 409) return RENT_MANAGE_MESSAGES.scheduleOverlaps;
  if (write === "schedule" && status === 422) return RENT_MANAGE_MESSAGES.scheduleBadDates;
  if (write === "charge" && status === 422) return RENT_MANAGE_MESSAGES.chargeInvalid;
  return RENT_MANAGE_MESSAGES.retry;
}

export function reminderSetupFailure(error: unknown): string {
  const common = commonFailure(error);
  if (common) return common;
  switch (httpStatus(error)) {
    case 409:
      return REMINDER_SETUP_MESSAGES.alreadyExists;
    case 422:
      return REMINDER_SETUP_MESSAGES.cantSave;
    default:
      return RENT_MANAGE_MESSAGES.retry;
  }
}
