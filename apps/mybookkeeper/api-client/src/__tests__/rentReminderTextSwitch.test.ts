import { describe, expect, it } from "vitest";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import type { RentReminderSmsStatus } from "../types/rent/rent-reminder-sms-status";
import { isTextSwitchLocked, showsTextSwitch } from "../utils/rentReminderTextSwitch";

const SMS: RentReminderSmsStatus = { available: true, allowed: true, from_number: null };
const NOT_ALLOWED: RentReminderSmsStatus = { ...SMS, allowed: false };
const texting = { sms_enabled: true } as RentReminderPlan;
const emailing = { sms_enabled: false } as RentReminderPlan;

describe("showsTextSwitch", () => {
  it("shows for an owner who may text, with or without a plan", () => {
    expect(showsTextSwitch({ plan: null, sms: SMS })).toBe(true);
    expect(showsTextSwitch({ plan: emailing, sms: SMS })).toBe(true);
  });

  it("hides for an owner who may not text, unless their saved plan still texts", () => {
    expect(showsTextSwitch({ plan: null, sms: NOT_ALLOWED })).toBe(false);
    expect(showsTextSwitch({ plan: emailing, sms: NOT_ALLOWED })).toBe(false);
    expect(showsTextSwitch({ plan: texting, sms: NOT_ALLOWED })).toBe(true);
  });
});

describe("isTextSwitchLocked", () => {
  it("is free for an owner who may text on a server that can", () => {
    expect(isTextSwitchLocked(SMS, false)).toBe(false);
    expect(isTextSwitchLocked(SMS, true)).toBe(false);
  });

  it("is locked when the server can't send texts", () => {
    expect(isTextSwitchLocked({ ...SMS, available: false }, true)).toBe(true);
  });

  it("only turns texts off for an owner who may not text", () => {
    expect(isTextSwitchLocked(NOT_ALLOWED, true)).toBe(false);
    expect(isTextSwitchLocked(NOT_ALLOWED, false)).toBe(true);
  });
});
