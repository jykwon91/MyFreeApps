import { describe, expect, it, vi } from "vitest";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import { describeReminderError } from "../utils/rentReminderError";
import { describePlan, formatDueDate, formatSendMoment, formatSendTime } from "../utils/rentReminderFormat";
import { deviceTimeZone, sendTimeLabel } from "../utils/rentReminderZone";

describe("describeReminderError", () => {
  it("never shows a code it doesn't know", () => {
    expect(describeReminderError("weird_internal_code")).toBe("Something went wrong sending it");
    expect(describeReminderError(null)).toBe("Something went wrong sending it");
  });

  it("says a text that was never confirmed may still arrive", () => {
    expect(describeReminderError("no_phone_confirmation")).toContain("may still arrive");
    expect(describeReminderError("send_interrupted")).toContain("may still arrive");
  });

  it("says a text the relay never confirmed may already have been sent, and where to check", () => {
    const reason = describeReminderError("sms_outcome_unknown");
    expect(reason).toContain("may already have been sent");
    expect(reason).toContain("httpsms.com");
  });

  it("says a text that never reached the relay wasn't sent", () => {
    expect(describeReminderError("sms_network_error")).toBe("The server couldn't reach the text relay, so it wasn't sent");
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
    const weekly = { frequency: "weekly", due_weekday: 6, send_days_before: 1, send_time: "18:00:00", timezone: "America/Chicago" } as RentReminderPlan;
    expect(describePlan(weekly)).toBe("Weekly, due every Sunday · reminded the day before at 6:00 PM CST");
    expect(describePlan({ ...weekly, frequency: "monthly", due_weekday: null, send_days_before: 3 })).toBe("Monthly, due on the 1st · reminded 3 days before at 6:00 PM CST");
  });

  it("names the zone the plan is stored in, so a Pacific host isn't misled", () => {
    const weekly = { frequency: "weekly", due_weekday: 6, send_days_before: 1, send_time: "18:00:00", timezone: "America/Los_Angeles" } as RentReminderPlan;
    expect(describePlan(weekly)).toMatch(/at 6:00 PM P[SD]T$/);
  });

  it("labels the send-time field and the send moment with the zone", () => {
    expect(sendTimeLabel("America/Chicago", new Date("2026-11-20T12:00:00Z"))).toBe("At (CST)");
    expect(sendTimeLabel("America/Chicago", new Date("2026-07-20T12:00:00Z"))).toBe("At (CDT)");
    expect(formatSendMoment("2026-11-21T00:00:00Z", "America/Los_Angeles")).toBe("Fri, Nov 20, 4:00 PM PST");
  });

  it("uses the device zone when it is valid, else the Central default", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    spy.mockReturnValue({ timeZone: "America/Denver" } as Intl.ResolvedDateTimeFormatOptions);
    expect(deviceTimeZone()).toBe("America/Denver");
    spy.mockReturnValue({ timeZone: "Not/AZone" } as Intl.ResolvedDateTimeFormatOptions);
    expect(deviceTimeZone()).toBe("America/Chicago");
    spy.mockReturnValue({ timeZone: undefined } as unknown as Intl.ResolvedDateTimeFormatOptions);
    expect(deviceTimeZone()).toBe("America/Chicago");
    spy.mockRestore();
  });
});
