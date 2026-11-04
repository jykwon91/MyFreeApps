import { describe, expect, it } from "vitest";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import { describeReminderError } from "../utils/rentReminderError";
import { describePlan, formatDueDate, formatSendTime } from "../utils/rentReminderFormat";

describe("describeReminderError", () => {
  it("never shows a code it doesn't know", () => {
    expect(describeReminderError("weird_internal_code")).toBe("Something went wrong sending it");
    expect(describeReminderError(null)).toBe("Something went wrong sending it");
  });

  it("says a text that was never confirmed may still arrive", () => {
    expect(describeReminderError("no_phone_confirmation")).toContain("may still arrive");
    expect(describeReminderError("send_interrupted")).toContain("may still arrive");
  });

  it("explains the phone and relay failures", () => {
    expect(describeReminderError("phone_failed: RESULT_ERROR_GENERIC")).toBe("The phone reported a problem sending it. Check the httpSMS app");
    expect(describeReminderError("sms_send_failed")).toBe("The text relay refused it");
    expect(describeReminderError("constructor")).toBe("Something went wrong sending it");
  });
});

describe("reminder formatting", () => {
  it("formats a time and a due date", () => {
    expect(formatSendTime("18:00:00")).toBe("6:00 PM");
    expect(formatDueDate("2026-11-01")).toBe("Sun, Nov 1");
  });

  it("summarises a weekly and a monthly plan", () => {
    const weekly = { frequency: "weekly", due_weekday: 6, send_days_before: 1, send_time: "18:00:00" } as RentReminderPlan;
    expect(describePlan(weekly)).toBe("Weekly, due every Sunday · reminded the day before at 6:00 PM");
    expect(describePlan({ ...weekly, frequency: "monthly", due_weekday: null, send_days_before: 3 })).toBe("Monthly, due on the 1st · reminded 3 days before at 6:00 PM");
  });
});
