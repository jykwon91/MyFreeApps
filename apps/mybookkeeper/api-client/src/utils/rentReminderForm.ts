import {
  DEFAULT_SEND_DAYS_BEFORE,
  DEFAULT_SEND_TIME,
  DEFAULT_TIMEZONE,
  MAX_SEND_DAYS_BEFORE,
  SEND_TIME_MAX,
  SEND_TIME_MIN,
  SUNDAY,
} from "../constants/rentReminderDefaults";
import type { RentReminderFormValues } from "../types/rent/rent-reminder-form-values";
import type { RentReminderFrequency } from "../types/rent/rent-reminder-frequency";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";
import type { RentReminderPlanRequest } from "../types/rent/rent-reminder-plan-request";
import { toTimeInputValue } from "./rentReminderFormat";

/** The form's starting point: the saved plan, or the defaults for a first-time setup. */
export function reminderFormValues(plan: RentReminderPlan | null, smsAvailable: boolean): RentReminderFormValues {
  return {
    frequency: plan?.frequency ?? "weekly",
    dueWeekday: plan?.due_weekday ?? SUNDAY,
    sendDaysBefore: String(plan?.send_days_before ?? DEFAULT_SEND_DAYS_BEFORE.weekly),
    sendTime: plan ? toTimeInputValue(plan.send_time) : DEFAULT_SEND_TIME,
    emailEnabled: plan?.email_enabled ?? true,
    smsEnabled: (plan?.sms_enabled ?? false) && smsAvailable,
    paymentInstructions: plan?.payment_instructions ?? "",
    amountOverride: plan?.amount_override ?? "",
    isActive: plan?.is_active ?? true,
  };
}

/** Picking a frequency resets "days before" to its default: weekly and monthly want very different lead times. */
export function withFrequency(values: RentReminderFormValues, frequency: RentReminderFrequency): RentReminderFormValues {
  return { ...values, frequency, sendDaysBefore: String(DEFAULT_SEND_DAYS_BEFORE[frequency]) };
}

export function isDaysBeforeValid(frequency: RentReminderFrequency, text: string): boolean {
  const days = Number(text);
  return text !== "" && Number.isInteger(days) && days >= 0 && days <= MAX_SEND_DAYS_BEFORE[frequency];
}

export function isSendTimeValid(time: string): boolean {
  return time >= SEND_TIME_MIN && time <= SEND_TIME_MAX;
}

export function isAmountOverrideValid(text: string): boolean {
  return text === "" || (Number.isFinite(Number(text)) && Number(text) > 0);
}

export function canSaveReminder(values: RentReminderFormValues): boolean {
  return (
    isDaysBeforeValid(values.frequency, values.sendDaysBefore) &&
    isSendTimeValid(values.sendTime) &&
    isAmountOverrideValid(values.amountOverride) &&
    (values.emailEnabled || values.smsEnabled)
  );
}

/** The whole plan, as the server wants it every time. A saved plan keeps its own time zone. */
export function reminderPlanRequest(values: RentReminderFormValues, plan: RentReminderPlan | null): RentReminderPlanRequest {
  return {
    frequency: values.frequency,
    due_weekday: values.frequency === "weekly" ? values.dueWeekday : null,
    send_days_before: Number(values.sendDaysBefore),
    send_time: values.sendTime,
    timezone: plan?.timezone ?? DEFAULT_TIMEZONE,
    email_enabled: values.emailEnabled,
    sms_enabled: values.smsEnabled,
    amount_override: values.amountOverride === "" ? null : values.amountOverride,
    payment_instructions: values.paymentInstructions.trim() || null,
    is_active: values.isActive,
  };
}
