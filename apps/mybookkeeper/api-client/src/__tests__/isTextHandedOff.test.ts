import { describe, expect, it } from "vitest";
import { RENT_REMINDER_STATUS_LABEL } from "../constants/rentReminderLabels";
import type { RentReminderSendStatus } from "../types/rent/rent-reminder-send-status";
import { isTextHandedOff } from "../utils/isTextHandedOff";

// Every status the app knows, so a new one has to be decided here.
const STATUSES = Object.keys(RENT_REMINDER_STATUS_LABEL) as RentReminderSendStatus[];

describe("isTextHandedOff", () => {
  it("is true only while the phone has the text and hasn't reported on it", () => {
    expect(STATUSES.filter((status) => isTextHandedOff({ status }))).toEqual(["sent_to_phone"]);
  });
});
