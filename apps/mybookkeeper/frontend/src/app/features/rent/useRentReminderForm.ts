import { useState } from "react";
import { showError, showSuccess, extractErrorMessage } from "@platform/ui";
import {
  useCreateRentReminderPlanMutation,
  useUpdateRentReminderPlanMutation,
} from "@mybookkeeper/api-client/store/rentRemindersApi";
import {
  canSaveReminder,
  isDaysBeforeValid,
  isSendTimeValid,
  reminderFormValues,
  reminderPlanRequest,
  withFrequency,
} from "@mybookkeeper/api-client/utils/rentReminderForm";
import type { RentReminderFormValues } from "@mybookkeeper/api-client/types/rent/rent-reminder-form-values";
import type { RentReminderFrequency } from "@mybookkeeper/api-client/types/rent/rent-reminder-frequency";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";

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
  const [values, setValues] = useState<RentReminderFormValues>(() =>
    reminderFormValues(existing, smsAvailable),
  );
  const [create, { isLoading: isCreating }] = useCreateRentReminderPlanMutation();
  const [update, { isLoading: isUpdating }] = useUpdateRentReminderPlanMutation();

  const change = <K extends keyof RentReminderFormValues>(key: K) =>
    (value: RentReminderFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const daysValid = isDaysBeforeValid(values.frequency, values.sendDaysBefore);
  const timeValid = isSendTimeValid(values.sendTime);
  const hasChannel = values.emailEnabled || values.smsEnabled;
  const canSubmit = canSaveReminder(values);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const body = { applicantId, ...reminderPlanRequest(values, existing) };
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
    ...values,
    setFrequency: (next: RentReminderFrequency) => setValues((current) => withFrequency(current, next)),
    setDueWeekday: change("dueWeekday"),
    setSendDaysBefore: change("sendDaysBefore"),
    setSendTime: change("sendTime"),
    setEmailEnabled: change("emailEnabled"),
    setSmsEnabled: change("smsEnabled"),
    setPaymentInstructions: change("paymentInstructions"),
    setAmountOverride: change("amountOverride"),
    setIsActive: change("isActive"),
    daysValid,
    timeValid,
    hasChannel,
    canSubmit,
    isSaving: isCreating || isUpdating,
    handleSubmit,
  };
}
