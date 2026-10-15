import { useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateRentReminderPlanMutation,
  useUpdateRentReminderPlanMutation,
} from "@/shared/store/rentRemindersApi";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import {
  DEFAULT_SEND_DAYS_BEFORE,
  DEFAULT_SEND_TIME,
  DEFAULT_TIMEZONE,
  MAX_SEND_DAYS_BEFORE,
  SEND_TIME_MAX,
  SEND_TIME_MIN,
  SUNDAY,
} from "./rent-reminder-labels";
import { toTimeInputValue } from "./rent-reminder-format";
import type { RentReminderFrequency } from "@/shared/types/rent/rent-reminder-frequency";
import type { RentReminderPlan } from "@/shared/types/rent/rent-reminder-plan";

export interface UseRentReminderFormArgs {
  applicantId: string;
  existing: RentReminderPlan | null;
  smsAvailable: boolean;
  onSaved: () => void;
}

/**
 * Form state for a tenant's reminder plan.
 *
 * Picking a frequency resets "days before" to that frequency's default (a day
 * ahead for weekly, three for monthly) — the two cadences want very different
 * lead times, and carrying 3 over to a weekly plan would remind on Thursday
 * for a Sunday payment. The value stays editable afterwards.
 */
export function useRentReminderForm({
  applicantId,
  existing,
  smsAvailable,
  onSaved,
}: UseRentReminderFormArgs) {
  const [frequency, setFrequencyState] = useState<RentReminderFrequency>(
    existing?.frequency ?? "weekly",
  );
  const [dueWeekday, setDueWeekday] = useState<number>(existing?.due_weekday ?? SUNDAY);
  const [sendDaysBefore, setSendDaysBefore] = useState<string>(
    String(existing?.send_days_before ?? DEFAULT_SEND_DAYS_BEFORE.weekly),
  );
  const [sendTime, setSendTime] = useState(
    existing ? toTimeInputValue(existing.send_time) : DEFAULT_SEND_TIME,
  );
  const [emailEnabled, setEmailEnabled] = useState(existing?.email_enabled ?? true);
  const [smsEnabled, setSmsEnabled] = useState(
    (existing?.sms_enabled ?? false) && smsAvailable,
  );
  const [paymentInstructions, setPaymentInstructions] = useState(
    existing?.payment_instructions ?? "",
  );
  const [amountOverride, setAmountOverride] = useState(existing?.amount_override ?? "");
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);

  const [create, { isLoading: isCreating }] = useCreateRentReminderPlanMutation();
  const [update, { isLoading: isUpdating }] = useUpdateRentReminderPlanMutation();

  function setFrequency(next: RentReminderFrequency) {
    setFrequencyState(next);
    setSendDaysBefore(String(DEFAULT_SEND_DAYS_BEFORE[next]));
  }

  const days = Number(sendDaysBefore);
  const daysValid =
    sendDaysBefore !== "" &&
    Number.isInteger(days) &&
    days >= 0 &&
    days <= MAX_SEND_DAYS_BEFORE[frequency];
  const timeValid = sendTime >= SEND_TIME_MIN && sendTime <= SEND_TIME_MAX;
  const overrideValid =
    amountOverride === "" || (Number.isFinite(Number(amountOverride)) && Number(amountOverride) > 0);
  const hasChannel = emailEnabled || smsEnabled;
  const canSubmit = daysValid && timeValid && overrideValid && hasChannel;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const body = {
      applicantId,
      frequency,
      due_weekday: frequency === "weekly" ? dueWeekday : null,
      send_days_before: days,
      send_time: sendTime,
      timezone: existing?.timezone ?? DEFAULT_TIMEZONE,
      email_enabled: emailEnabled,
      sms_enabled: smsEnabled,
      amount_override: amountOverride === "" ? null : amountOverride,
      payment_instructions: paymentInstructions.trim() || null,
      is_active: isActive,
    };
    try {
      if (existing) {
        await update(body).unwrap();
        showSuccess("Reminder settings saved.");
      } else {
        await create(body).unwrap();
        showSuccess("Rent reminders are on.");
      }
      onSaved();
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  return {
    frequency,
    setFrequency,
    dueWeekday,
    setDueWeekday,
    sendDaysBefore,
    setSendDaysBefore,
    sendTime,
    setSendTime,
    emailEnabled,
    setEmailEnabled,
    smsEnabled,
    setSmsEnabled,
    paymentInstructions,
    setPaymentInstructions,
    amountOverride,
    setAmountOverride,
    isActive,
    setIsActive,
    daysValid,
    timeValid,
    hasChannel,
    canSubmit,
    isSaving: isCreating || isUpdating,
    handleSubmit,
  };
}
