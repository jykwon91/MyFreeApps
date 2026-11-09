import { describe, expect, it } from "vitest";
import type { RentReminderFormValues } from "../types/rent/rent-reminder-form-values";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import {
  canSaveReminder,
  isAmountOverrideValid,
  isDaysBeforeValid,
  isSendTimeValid,
  reminderFormValues,
  reminderPlanRequest,
  withFrequency,
} from "../utils/rentReminderForm";
import { graceDaysFromText, graceDaysToText, isPositiveAmount, isValidGraceDays } from "../utils/rentScheduleForm";

const PLAN: RentReminderPlan = {
  id: "p1",
  applicant_id: "a1",
  frequency: "monthly",
  due_weekday: null,
  send_days_before: 3,
  send_time: "18:30:00",
  timezone: "America/Denver",
  email_enabled: true,
  sms_enabled: true,
  amount_override: "900.00",
  payment_instructions: "Zelle",
  is_active: false,
  created_at: "2026-10-15T00:00:00Z",
  updated_at: "2026-10-15T00:00:00Z",
};

describe("rent schedule form helpers", () => {
  it("accepts only an amount above zero", () => {
    expect(isPositiveAmount("1500")).toBe(true);
    expect(isPositiveAmount("0.01")).toBe(true);
    expect(isPositiveAmount("0")).toBe(false);
    expect(isPositiveAmount("-5")).toBe(false);
    expect(isPositiveAmount("")).toBe(false);
    expect(isPositiveAmount("abc")).toBe(false);
  });

  it("turns a blank late window into an explicit null and back", () => {
    expect(graceDaysFromText("")).toBeNull();
    expect(graceDaysFromText("5")).toBe(5);
    expect(graceDaysToText(null)).toBe("");
    expect(graceDaysToText(undefined)).toBe("");
    expect(graceDaysToText(0)).toBe("0");
  });

  it("allows a late window from blank to 365 whole days", () => {
    expect(isValidGraceDays("")).toBe(true);
    expect(isValidGraceDays("0")).toBe(true);
    expect(isValidGraceDays("365")).toBe(true);
    expect(isValidGraceDays("366")).toBe(false);
    expect(isValidGraceDays("2.5")).toBe(false);
    expect(isValidGraceDays("-1")).toBe(false);
  });
});

describe("rent reminder form helpers", () => {
  it("starts a first-time setup weekly on Sunday, by email, a day ahead at 6pm", () => {
    expect(reminderFormValues(null, true)).toEqual({
      frequency: "weekly",
      dueWeekday: 6,
      sendDaysBefore: "1",
      sendTime: "18:00",
      emailEnabled: true,
      smsEnabled: false,
      paymentInstructions: "",
      amountOverride: "",
      isActive: true,
    });
  });

  it("starts an edit from the saved plan, and drops text when the server can't send it", () => {
    expect(reminderFormValues(PLAN, true)).toMatchObject({ frequency: "monthly", sendDaysBefore: "3", sendTime: "18:30", smsEnabled: true, amountOverride: "900.00", isActive: false });
    expect(reminderFormValues(PLAN, false).smsEnabled).toBe(false);
  });

  it("resets days before to the new frequency's default", () => {
    const weekly = reminderFormValues(null, true);
    expect(withFrequency(weekly, "monthly")).toMatchObject({ frequency: "monthly", sendDaysBefore: "3" });
    expect(withFrequency({ ...weekly, frequency: "monthly", sendDaysBefore: "9" }, "weekly").sendDaysBefore).toBe("1");
  });

  it("bounds days before by frequency", () => {
    expect(isDaysBeforeValid("weekly", "6")).toBe(true);
    expect(isDaysBeforeValid("weekly", "7")).toBe(false);
    expect(isDaysBeforeValid("monthly", "14")).toBe(true);
    expect(isDaysBeforeValid("monthly", "15")).toBe(false);
    expect(isDaysBeforeValid("monthly", "")).toBe(false);
    expect(isDaysBeforeValid("monthly", "1.5")).toBe(false);
  });

  it("allows send times from 9:00 to 19:59 only", () => {
    expect(isSendTimeValid("09:00")).toBe(true);
    expect(isSendTimeValid("19:59")).toBe(true);
    expect(isSendTimeValid("08:59")).toBe(false);
    expect(isSendTimeValid("20:00")).toBe(false);
  });

  it("allows a blank or positive fixed amount", () => {
    expect(isAmountOverrideValid("")).toBe(true);
    expect(isAmountOverrideValid("10")).toBe(true);
    expect(isAmountOverrideValid("0")).toBe(false);
    expect(isAmountOverrideValid("x")).toBe(false);
  });

  it("needs a channel, a good lead time, a good hour and a good amount to save", () => {
    const good: RentReminderFormValues = reminderFormValues(null, true);
    expect(canSaveReminder(good)).toBe(true);
    expect(canSaveReminder({ ...good, emailEnabled: false })).toBe(false);
    expect(canSaveReminder({ ...good, smsEnabled: true, emailEnabled: false })).toBe(true);
    expect(canSaveReminder({ ...good, sendTime: "21:00" })).toBe(false);
    expect(canSaveReminder({ ...good, sendDaysBefore: "9" })).toBe(false);
    expect(canSaveReminder({ ...good, amountOverride: "-1" })).toBe(false);
  });

  it("builds the whole plan for the server", () => {
    expect(reminderPlanRequest({ ...reminderFormValues(null, true), paymentInstructions: "  Zelle  " }, null)).toEqual({
      frequency: "weekly",
      due_weekday: 6,
      send_days_before: 1,
      send_time: "18:00",
      timezone: "America/Chicago",
      email_enabled: true,
      sms_enabled: false,
      amount_override: null,
      payment_instructions: "Zelle",
      is_active: true,
    });
  });

  it("drops the weekday for a monthly plan and keeps a saved plan's time zone", () => {
    const request = reminderPlanRequest(reminderFormValues(PLAN, true), PLAN);
    expect(request).toMatchObject({ frequency: "monthly", due_weekday: null, timezone: "America/Denver", amount_override: "900.00", is_active: false });
  });
});
