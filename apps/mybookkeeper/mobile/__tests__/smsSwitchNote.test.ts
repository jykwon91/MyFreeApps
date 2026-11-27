import { SMS_NOT_ALLOWED_NOTE } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import { REMINDER_SETUP_MESSAGES as S, smsFrom } from "../src/constants/rentReminderSetup";
import { smsSwitchNote } from "../src/features/rent/smsSwitchNote";
import { aReminderOverview } from "../test-support/aRentReminder";

describe("smsSwitchNote", () => {
  it("says texts aren't set up when the server can't send them", () => {
    expect(smsSwitchNote(aReminderOverview({ sms: { available: false, allowed: true, from_number: null } }))).toBe(S.smsUnavailable);
  });

  it("says to turn texts off, with no number or phone note, when the account may not send them", () => {
    const overview = aReminderOverview({ sms: { available: true, allowed: false, from_number: "+18885550100" }, tenant_has_phone: false });
    expect(smsSwitchNote(overview)).toBe(SMS_NOT_ALLOWED_NOTE);
  });

  it("names the number texts come from", () => {
    expect(smsSwitchNote(aReminderOverview({ sms: { available: true, allowed: true, from_number: "+18885550100" } }))).toBe(smsFrom("+18885550100"));
  });

  it("falls back to 'your Twilio number' when the server doesn't say which", () => {
    expect(smsSwitchNote(aReminderOverview({ sms: { available: true, allowed: true, from_number: null } }))).toBe("From your Twilio number.");
  });

  it("adds that the tenant has no phone number yet", () => {
    const overview = aReminderOverview({ sms: { available: true, allowed: true, from_number: "+18885550100" }, tenant_has_phone: false });
    expect(smsSwitchNote(overview)).toBe(`${smsFrom("+18885550100")} ${S.noPhone}`);
  });
});
