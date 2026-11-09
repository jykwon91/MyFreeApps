import { MAX_SEND_DAYS_BEFORE } from "@mybookkeeper/api-client/constants/rentReminderDefaults";
import { WEEKDAY_NAMES } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import { useCreateRentReminderPlanMutation, useUpdateRentReminderPlanMutation } from "@mybookkeeper/api-client/store/rentRemindersApi";
import type { RentReminderFormValues } from "@mybookkeeper/api-client/types/rent/rent-reminder-form-values";
import type { RentReminderFrequency } from "@mybookkeeper/api-client/types/rent/rent-reminder-frequency";
import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import {
  canSaveReminder,
  isAmountOverrideValid,
  isDaysBeforeValid,
  isSendTimeValid,
  reminderFormValues,
  reminderPlanRequest,
  withFrequency,
} from "@mybookkeeper/api-client/utils/rentReminderForm";
import { FormField, FormSheet, LoadingButton, OptionRow, SegmentedControl, SwitchRow, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { daysHintBad, REMINDER_SETUP_MESSAGES, smsFrom } from "../../constants/rentReminderSetup";
import { useFormSubmit } from "../shell/useFormSubmit";
import TimeField from "../shell/TimeField";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { reminderSetupFailure } from "./rentWriteFailure";

const FREQUENCY_SEGMENTS = [
  { value: "monthly", label: REMINDER_SETUP_MESSAGES.monthly },
  { value: "weekly", label: REMINDER_SETUP_MESSAGES.weekly },
] as const satisfies readonly { value: RentReminderFrequency; label: string }[];

interface RentReminderSheetProps {
  applicantId: string;
  overview: RentReminderOverview;
  onClose: () => void;
}

/** How the tenant pays, when to remind, where, and what to say. The plan is sent whole every time. */
export default function RentReminderSheet({ applicantId, overview, onClose }: RentReminderSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const { plan, sms } = overview;
  const [createPlan] = useCreateRentReminderPlanMutation();
  const [updatePlan] = useUpdateRentReminderPlanMutation();
  const { isBusy, failure, submit } = useFormSubmit();
  const initial = reminderFormValues(plan, sms.available);
  const [values, setValues] = useState<RentReminderFormValues>(initial);

  const change = <K extends keyof RentReminderFormValues>(key: K, value: RentReminderFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const hasChannel = values.emailEnabled || values.smsEnabled;
  const isDaysValid = isDaysBeforeValid(values.frequency, values.sendDaysBefore);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const hasChanges = (Object.keys(initial) as (keyof RentReminderFormValues)[]).some((key) => initial[key] !== values[key]);

  function close(): void {
    if (isBusy) return;
    if (hasChanges) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    if (!canSaveReminder(values)) return;
    const body = { applicantId, ...reminderPlanRequest(values, plan) };
    const landed = await submit(() => (plan ? updatePlan(body).unwrap() : createPlan(body).unwrap()), reminderSetupFailure);
    if (!landed) return;
    onClose();
    showToast(plan ? REMINDER_SETUP_MESSAGES.savedEdit : REMINDER_SETUP_MESSAGES.savedNew);
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={plan ? REMINDER_SETUP_MESSAGES.titleEdit : REMINDER_SETUP_MESSAGES.titleNew}>
      <Text style={mutedText}>{REMINDER_SETUP_MESSAGES.setUpIntro}</Text>

      <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>{REMINDER_SETUP_MESSAGES.tenantPays}</Text>
      <SegmentedControl
        accessibilityLabel={REMINDER_SETUP_MESSAGES.tenantPays}
        onChange={(frequency) => {
          if (!isBusy) setValues((current) => withFrequency(current, frequency));
        }}
        segments={FREQUENCY_SEGMENTS}
        value={values.frequency}
      />
      <Text style={mutedText}>{values.frequency === "monthly" ? REMINDER_SETUP_MESSAGES.monthlyNote : REMINDER_SETUP_MESSAGES.weeklyNote}</Text>

      {values.frequency === "weekly" ? (
        <View accessibilityLabel={REMINDER_SETUP_MESSAGES.weekday} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{REMINDER_SETUP_MESSAGES.weekday}</Text>
          {WEEKDAY_NAMES.map((name, index) => (
            <OptionRow
              isSelected={values.dueWeekday === index}
              key={name}
              label={name}
              onPress={() => {
                if (!isBusy) change("dueWeekday", index);
              }}
            />
          ))}
        </View>
      ) : null}

      <FormField
        editable={!isBusy}
        error={isDaysValid ? undefined : daysHintBad(MAX_SEND_DAYS_BEFORE[values.frequency])}
        hint={REMINDER_SETUP_MESSAGES.daysHintOk}
        keyboardType="number-pad"
        label={REMINDER_SETUP_MESSAGES.daysBefore}
        onChangeText={(text) => change("sendDaysBefore", text)}
        required
        value={values.sendDaysBefore}
      />

      <TimeField error={isSendTimeValid(values.sendTime) ? undefined : REMINDER_SETUP_MESSAGES.timeHintBad} label={REMINDER_SETUP_MESSAGES.sendTime} onChange={(time) => change("sendTime", time)} value={values.sendTime} />
      <Text style={mutedText}>{REMINDER_SETUP_MESSAGES.timeHintOk}</Text>

      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{REMINDER_SETUP_MESSAGES.sendBy}</Text>
      <SwitchRow
        disabled={isBusy}
        label={REMINDER_SETUP_MESSAGES.email}
        note={overview.tenant_has_email ? undefined : REMINDER_SETUP_MESSAGES.noEmail}
        onValueChange={(on) => change("emailEnabled", on)}
        value={values.emailEnabled}
      />
      <SwitchRow
        disabled={isBusy || !sms.available}
        label={REMINDER_SETUP_MESSAGES.sms}
        note={
          sms.available
            ? [smsFrom(sms.from_number ?? "", sms.encrypted), overview.tenant_has_phone ? null : REMINDER_SETUP_MESSAGES.noPhone].filter(Boolean).join(" ")
            : REMINDER_SETUP_MESSAGES.smsUnavailable
        }
        onValueChange={(on) => change("smsEnabled", on)}
        value={values.smsEnabled}
      />
      {hasChannel ? null : (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
          {REMINDER_SETUP_MESSAGES.needChannel}
        </Text>
      )}

      <FormField
        editable={!isBusy}
        hint={REMINDER_SETUP_MESSAGES.howToPayHint}
        inputStyle={{ minHeight: 72, textAlignVertical: "top" }}
        label={REMINDER_SETUP_MESSAGES.howToPay}
        maxLength={500}
        multiline
        onChangeText={(text) => change("paymentInstructions", text)}
        placeholder={REMINDER_SETUP_MESSAGES.howToPayPlaceholder}
        value={values.paymentInstructions}
      />

      <FormField
        editable={!isBusy}
        error={isAmountOverrideValid(values.amountOverride) ? undefined : REMINDER_SETUP_MESSAGES.fixedAmountInvalid}
        hint={REMINDER_SETUP_MESSAGES.fixedAmountHint}
        keyboardType="decimal-pad"
        label={REMINDER_SETUP_MESSAGES.fixedAmount}
        onChangeText={(text) => change("amountOverride", text)}
        value={values.amountOverride}
      />

      {plan ? <SwitchRow disabled={isBusy} label={REMINDER_SETUP_MESSAGES.remindersOn} note={REMINDER_SETUP_MESSAGES.remindersOnNote} onValueChange={(on) => change("isActive", on)} value={values.isActive} /> : null}

      <LoadingButton disabled={!canSaveReminder(values)} isLoading={isBusy} loadingText={REMINDER_SETUP_MESSAGES.saving} onPress={() => void save()}>
        {plan ? REMINDER_SETUP_MESSAGES.saveEdit : REMINDER_SETUP_MESSAGES.saveNew}
      </LoadingButton>
      <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
        {REMINDER_SETUP_MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
