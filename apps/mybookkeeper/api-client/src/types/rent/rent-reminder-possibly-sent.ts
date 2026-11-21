import type { RentReminderChannel } from "./rent-reminder-channel";

/** A failed try that may still have reached the tenant, as the operator was shown it. */
export interface RentReminderPossiblySent {
  channel: RentReminderChannel;
  /** The send's try number. Echoed back to confirm exactly this try. */
  attempt: number;
}
