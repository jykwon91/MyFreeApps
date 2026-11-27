import { describe, expect, it } from "vitest";
import { possiblySentAdvice, possiblySentWarning } from "../utils/rentReminderPossiblySent";

describe("possiblySentAdvice", () => {
  it("points a text to Twilio's messaging logs, or the tenant", () => {
    expect(possiblySentAdvice(["sms"], "Dana")).toBe(
      "Check the Twilio console's messaging logs (or ask Dana) before sending it again.",
    );
  });

  it("never sends an email to Twilio: an email is checked with the tenant", () => {
    const advice = possiblySentAdvice(["email"], "Dana");
    expect(advice).toBe("Ask Dana whether the email arrived before sending it again.");
    expect(advice).not.toContain("Twilio");
  });

  it("says where to check each one when both may have gone out, whatever their order", () => {
    const both =
      "Check the Twilio console's messaging logs for the text, and ask Dana about the email, before sending them again.";
    expect(possiblySentAdvice(["email", "sms"], "Dana")).toBe(both);
    expect(possiblySentAdvice(["sms", "email"], "Dana")).toBe(both);
  });
});

describe("possiblySentWarning", () => {
  it("names the tries that may have gone out, then says where to check", () => {
    expect(possiblySentWarning(["email", "sms"], "the tenant")).toBe(
      "The last email and text may already have reached the tenant. " +
        "Check the Twilio console's messaging logs for the text, and ask the tenant about the email, before sending them again.",
    );
  });

  it("names the tenant the way the app does", () => {
    expect(possiblySentWarning(["email"], "Dana")).toBe(
      "The last email may already have reached Dana. Ask Dana whether the email arrived before sending it again.",
    );
    expect(possiblySentWarning(["sms"], "them")).toBe(
      "The last text may already have reached them. Check the Twilio console's messaging logs (or ask them) before sending it again.",
    );
  });
});
