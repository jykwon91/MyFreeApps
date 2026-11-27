import { describe, expect, it, vi } from "vitest";
import { RENT_REMINDER_STATUS_LABEL } from "../constants/rentReminderLabels";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import { describeReminderError } from "../utils/rentReminderError";

describe("RENT_REMINDER_STATUS_LABEL", () => {
  it("reads as the text moves along", () => {
    const order = ["queued", "sent_to_provider", "sent", "delivered", "failed"] as const;
    expect(order.map((status) => RENT_REMINDER_STATUS_LABEL[status])).toEqual([
      "Sending",
      "With Twilio",
      "Sent",
      "Delivered",
      "Failed",
    ]);
  });
});
import { describePlan, formatDueDate, formatSendMoment, formatSendTime } from "../utils/rentReminderFormat";
import { deviceTimeZone, sendTimeLabel } from "../utils/rentReminderZone";

describe("describeReminderError", () => {
  it("never shows a code it doesn't know", () => {
    expect(describeReminderError("weird_internal_code")).toBe("Something went wrong sending it");
    expect(describeReminderError(null)).toBe("Something went wrong sending it");
  });

  it("says a text that was never confirmed may still arrive, and how to check", () => {
    const unconfirmed = describeReminderError("no_sms_confirmation");
    expect(unconfirmed).toContain("may still arrive");
    expect(unconfirmed).toContain("Check the Twilio console's messaging logs, or ask the tenant, before sending again");
    expect(describeReminderError("send_interrupted")).toBe(
      "Sending was interrupted, so it may still arrive. Check with the tenant before sending again",
    );
  });

  it("never sends the operator to Twilio about a send that could have been an email", () => {
    expect(describeReminderError("send_interrupted")).not.toContain("Twilio");
  });

  it("says a text that was never confirmed may already have been sent, and where to check", () => {
    const reason = describeReminderError("sms_outcome_unknown");
    expect(reason).toContain("may already have been sent");
    expect(reason).toContain("Twilio console's messaging logs, or ask the tenant");
  });

  it("says an email the mail server never confirmed may already have been sent, and to ask the tenant", () => {
    const reason = describeReminderError("email_outcome_unknown");
    expect(reason).toContain("may already have been sent");
    expect(reason).toContain("Ask the tenant");
    expect(reason).not.toContain("Twilio");
  });

  it("says a text that never reached the text service wasn't sent", () => {
    expect(describeReminderError("sms_network_error")).toBe("The server couldn't reach the text service, so it wasn't sent");
  });

  it("says how to fix a phone number that isn't valid", () => {
    expect(describeReminderError("invalid_phone")).toBe("The tenant's phone number isn't valid. Fix it on their record");
  });

  it("says what a known Twilio error means and what to do next, with the number", () => {
    expect(describeReminderError("sms_failed: 30032")).toBe(
      "Your toll-free number isn't verified yet, so carriers block its texts. Check its verification status in the Twilio console (Twilio error 30032)",
    );
    expect(describeReminderError("sms_failed: 30003")).toBe(
      "The tenant's phone was off or out of reach. Try again later (Twilio error 30003)",
    );
    expect(describeReminderError("sms_21610")).toBe(
      "The tenant replied STOP, so texts to them are blocked. Use email, or ask them to text START to your Twilio number (Twilio error 21610)",
    );
    expect(describeReminderError("sms_21211")).toBe(
      "The phone number isn't valid. Fix it on the tenant's record (Twilio error 21211)",
    );
  });

  it("gives every number that can't take texts the same advice", () => {
    const cantReceive = "That number can't receive texts. Check it with the tenant, or use email";
    expect(describeReminderError("sms_21614")).toBe(`${cantReceive} (Twilio error 21614)`);
    expect(describeReminderError("sms_failed: 30005")).toBe(`${cantReceive} (Twilio error 30005)`);
    expect(describeReminderError("sms_failed: 30006")).toBe(`${cantReceive} (Twilio error 30006)`);
  });

  it("says Twilio refused the server's credentials, not the text", () => {
    expect(describeReminderError("sms_20003")).toBe(
      "Twilio didn't accept the server's account SID or auth token, so no text can go out until they're fixed on the server (Twilio error 20003)",
    );
  });

  it("keeps an unlisted Twilio error visible, with Twilio's page for it", () => {
    expect(describeReminderError("sms_failed: 30008")).toBe(
      "The text couldn't be delivered (Twilio error 30008, see twilio.com/docs/api/errors/30008)",
    );
    expect(describeReminderError("sms_21612")).toBe(
      "The text service refused it (Twilio error 21612, see twilio.com/docs/api/errors/21612)",
    );
  });

  it("describes texts from before Twilio without blaming Twilio", () => {
    const legacy = [
      ["sms_failed: expired", "The text expired before it went out"],
      ["sms_failed: RESULT_ERROR_GENERIC_FAILURE", "The text couldn't be delivered"],
      ["sms_failed: 1", "The text couldn't be delivered"],
      ["sms_failed: unknown", "The text couldn't be delivered"],
      ["sms_http_400", "The text service refused it"],
      ["sms_send_failed", "The text service refused it"],
    ];
    for (const [code, reason] of legacy) {
      expect(describeReminderError(code)).toBe(reason);
      expect(describeReminderError(code)).not.toContain("Twilio");
    }
  });

  it("never mistakes a prototype key for a code", () => {
    expect(describeReminderError("constructor")).toBe("Something went wrong sending it");
    expect(describeReminderError("sms_failed: constructor")).toBe("The text couldn't be delivered");
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
