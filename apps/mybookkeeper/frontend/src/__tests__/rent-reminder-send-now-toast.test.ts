import { describe, expect, it } from "vitest";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";
import { sendNowToast } from "@/app/features/rent/rent-reminder-send-now-toast";

function aTry(overrides: Partial<RentReminderSend>): RentReminderSend {
  return {
    id: "send-1",
    due_date: "2026-11-01",
    channel: "email",
    status: "sent",
    amount: "300.00",
    error_code: null,
    created_at: "2026-10-31T23:00:00Z",
    sent_at: "2026-10-31T23:00:05Z",
    confirmed_at: null,
    ...overrides,
  };
}

const EMAIL_SENT = aTry({});
const EMAIL_FAILED = aTry({ status: "failed", error_code: "email_send_failed" });
const EMAIL_UNSURE = aTry({ status: "failed", error_code: "email_outcome_unknown" });
const TEXT_WITH_TWILIO = aTry({ id: "send-2", channel: "sms", status: "sent_to_provider" });
const TEXT_SENT = aTry({ id: "send-2", channel: "sms", status: "sent" });
const TEXT_DELIVERED = aTry({ id: "send-2", channel: "sms", status: "delivered" });
const TEXT_FAILED = aTry({ id: "send-2", channel: "sms", status: "failed", error_code: "sms_network_error" });
const TEXT_UNSURE = aTry({ id: "send-2", channel: "sms", status: "failed", error_code: "sms_outcome_unknown" });

const WITH_TWILIO_UNTIL_IT_REPORTS = "The text is with Twilio, and the history below will show whether it went out.";

describe("sendNowToast when nothing failed", () => {
  it.each([
    ["email and a text Twilio has", [EMAIL_SENT, TEXT_WITH_TWILIO], `Reminder sent by email. ${WITH_TWILIO_UNTIL_IT_REPORTS}`],
    ["only a text Twilio has", [TEXT_WITH_TWILIO], WITH_TWILIO_UNTIL_IT_REPORTS],
    ["only an email", [EMAIL_SENT], "Reminder sent by email."],
    ["email and a text Twilio sent", [EMAIL_SENT, TEXT_SENT], "Reminder sent by email and text."],
    ["email and a delivered text", [EMAIL_SENT, TEXT_DELIVERED], "Reminder sent by email and text."],
    ["only a delivered text", [TEXT_DELIVERED], "Reminder sent by text."],
  ])("%s", (_case, results, message) => {
    expect(sendNowToast(results)).toEqual({ message, isProblem: false });
  });
});

describe("sendNowToast when a channel failed", () => {
  it.each([
    [
      "an email that didn't go out, beside a text Twilio has",
      [EMAIL_FAILED, TEXT_WITH_TWILIO],
      "The email didn't go out. The text is with Twilio. See history below.",
    ],
    [
      "an email that didn't go out, beside a text Twilio sent",
      [EMAIL_FAILED, TEXT_SENT],
      "The email didn't go out. The text went out. See history below.",
    ],
    [
      "an email that didn't go out, beside a delivered text",
      [EMAIL_FAILED, TEXT_DELIVERED],
      "The email didn't go out. The text went out. See history below.",
    ],
    [
      "an email that may have gone out, beside a text Twilio has",
      [EMAIL_UNSURE, TEXT_WITH_TWILIO],
      "The email may already have been sent. Ask the tenant whether the email arrived before sending it again. The text is with Twilio. See history below.",
    ],
    [
      "a text that didn't go out, beside a sent email",
      [EMAIL_SENT, TEXT_FAILED],
      "The text didn't go out. The email went out. See history below.",
    ],
    [
      "a text that may have gone out, beside a sent email",
      [EMAIL_SENT, TEXT_UNSURE],
      "The text may already have been sent. Check the Twilio console's messaging logs (or ask the tenant) before sending it again. The email went out. See history below.",
    ],
    [
      "both failed",
      [EMAIL_FAILED, TEXT_FAILED],
      "The email and text didn't go out. See history below.",
    ],
    [
      "an email that didn't go out, beside a text that may have",
      [EMAIL_FAILED, TEXT_UNSURE],
      "The email didn't go out. The text may already have been sent. Check the Twilio console's messaging logs (or ask the tenant) before sending it again. See history below.",
    ],
  ])("%s", (_case, results, message) => {
    expect(sendNowToast(results)).toEqual({ message, isProblem: true });
  });
});
