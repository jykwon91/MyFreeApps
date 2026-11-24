import { describe, expect, it } from "vitest";
import { rentReminderPlanChannels } from "../utils/rentReminderPlanChannels";

describe("rentReminderPlanChannels", () => {
  it("lists both channels, email first, when both are on", () => {
    expect(rentReminderPlanChannels({ email_enabled: true, sms_enabled: true })).toEqual(["email", "sms"]);
  });

  it("lists only the channels that are on", () => {
    expect(rentReminderPlanChannels({ email_enabled: true, sms_enabled: false })).toEqual(["email"]);
    expect(rentReminderPlanChannels({ email_enabled: false, sms_enabled: true })).toEqual(["sms"]);
    expect(rentReminderPlanChannels({ email_enabled: false, sms_enabled: false })).toEqual([]);
  });
});
