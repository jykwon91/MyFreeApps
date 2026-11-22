import { describe, expect, it } from "vitest";
import { readyTextFailureMessage } from "@/features/service/readyTextFailureMessage";

describe("readyTextFailureMessage", () => {
  it("asks the operator to text by hand when the text definitely didn't go out", () => {
    expect(readyTextFailureMessage({ sms_error: "opted out", sms_outcome_unknown: false }, "5125550101")).toBe(
      "SMS not sent (opted out). Please text 5125550101 manually.",
    );
  });

  it("warns the text may already have gone out when Twilio never confirmed it", () => {
    const message = readyTextFailureMessage({ sms_error: "timed out", sms_outcome_unknown: true }, "5125550101");
    expect(message).toContain("may already have been sent");
    expect(message).toContain("Check the Twilio message log");
    expect(message).not.toContain("SMS not sent");
  });
});
