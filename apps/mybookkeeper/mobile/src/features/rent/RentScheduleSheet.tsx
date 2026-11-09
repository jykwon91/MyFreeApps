import { RENT_CADENCE_LABEL, RENT_START_HINT } from "@mybookkeeper/api-client/constants/rentLabels";
import {
  useCreateRentScheduleMutation,
  useDeleteRentScheduleMutation,
  useUpdateRentScheduleMutation,
} from "@mybookkeeper/api-client/store/rentLedgerApi";
import type { RentCadence } from "@mybookkeeper/api-client/types/rent/rent-cadence";
import type { RentSchedule } from "@mybookkeeper/api-client/types/rent/rent-schedule";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { graceDaysFromText, graceDaysToText, isPositiveAmount, isValidGraceDays } from "@mybookkeeper/api-client/utils/rentScheduleForm";
import { formatCurrency } from "@platform/core/utils/currency";
import { FormField, FormSheet, LoadingButton, SegmentedControl, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { RENT_MANAGE_MESSAGES, scheduleFixedTerms } from "../../constants/rentManage";
import { dateFromIso } from "../../lib/localDate";
import { askOnce } from "../../lib/askOnce";
import OptionalDateField from "../shell/OptionalDateField";
import { useFormSubmit } from "../shell/useFormSubmit";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { rentWriteFailure } from "./rentWriteFailure";

const CADENCE_SEGMENTS = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
] as const satisfies readonly { value: RentCadence; label: string }[];

interface RentScheduleSheetProps {
  applicantId: string;
  /** Null sets rent up from scratch. */
  existing: RentSchedule | null;
  onClose: () => void;
}

/** Amount and cadence are set once: a rent change is a new schedule, so past periods keep the rate they were charged. */
export default function RentScheduleSheet({ applicantId, existing, onClose }: RentScheduleSheetProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [createSchedule] = useCreateRentScheduleMutation();
  const [updateSchedule] = useUpdateRentScheduleMutation();
  const [deleteSchedule] = useDeleteRentScheduleMutation();
  const { isBusy, failure, submit } = useFormSubmit();
  const [isRemoving, setIsRemoving] = useState(false);
  const asking = useRef(false);

  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [cadence, setCadence] = useState<RentCadence>(existing?.cadence ?? "monthly");
  const [startDate, setStartDate] = useState<string | null>(existing?.start_date ?? null);
  const [endDate, setEndDate] = useState<string | null>(existing?.end_date ?? null);
  const [graceDays, setGraceDays] = useState(graceDaysToText(existing?.grace_days));
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const isEnding = startDate !== null && endDate !== null && endDate < startDate;
  const isGraceValid = isValidGraceDays(graceDays);
  const canSave = isGraceValid && !isEnding && (existing !== null || (startDate !== null && isPositiveAmount(amount)));
  const hasChanges = existing
    ? endDate !== existing.end_date || graceDays !== graceDaysToText(existing.grace_days) || notes !== (existing.notes ?? "")
    : amount !== "" || startDate !== null || endDate !== null || graceDays !== "" || notes !== "" || cadence !== "monthly";
  const busy = isBusy || isRemoving;

  function close(): void {
    if (busy) return;
    if (hasChanges) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    if (!canSave || busy) return;
    const landed = await submit(
      async () => {
        if (existing) {
          // Always sent, so clearing a value reaches the server as an explicit null rather than "left alone".
          await updateSchedule({ scheduleId: existing.id, applicantId, end_date: endDate, grace_days: graceDaysFromText(graceDays), notes: notes.trim() || null }).unwrap();
        } else if (startDate) {
          await createSchedule({ applicant_id: applicantId, amount, cadence, start_date: startDate, end_date: endDate, grace_days: graceDaysFromText(graceDays), notes: notes.trim() || null }).unwrap();
        }
      },
      (error) => rentWriteFailure(error, "schedule"),
    );
    if (!landed) return;
    onClose();
    showToast(existing ? RENT_MANAGE_MESSAGES.scheduleUpdated : RENT_MANAGE_MESSAGES.scheduleSaved);
  }

  async function remove(): Promise<void> {
    if (!existing) return;
    setIsRemoving(true);
    const landed = await submit(() => deleteSchedule({ scheduleId: existing.id, applicantId }).unwrap(), (error) => rentWriteFailure(error, "schedule"));
    setIsRemoving(false);
    if (!landed) return;
    onClose();
    showToast(RENT_MANAGE_MESSAGES.scheduleRemoved);
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={existing ? RENT_MANAGE_MESSAGES.scheduleTitleEdit : RENT_MANAGE_MESSAGES.scheduleTitleNew}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RENT_MANAGE_MESSAGES.scheduleIntro}</Text>

      {existing ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>
          {scheduleFixedTerms(`${formatCurrency(existing.amount)} ${RENT_CADENCE_LABEL[existing.cadence]}, starting ${formatLongDate(existing.start_date)}`)}
        </Text>
      ) : (
        <>
          <FormField
            editable={!busy}
            hint={RENT_MANAGE_MESSAGES.amountHint}
            keyboardType="decimal-pad"
            label={RENT_MANAGE_MESSAGES.amount}
            onChangeText={setAmount}
            required
            value={amount}
          />
          <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>{RENT_MANAGE_MESSAGES.cadence}</Text>
          <SegmentedControl accessibilityLabel={RENT_MANAGE_MESSAGES.cadence} onChange={setCadence} segments={CADENCE_SEGMENTS} value={cadence} />
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${RENT_MANAGE_MESSAGES.cadenceHint} ${RENT_START_HINT[cadence]}`}</Text>
          <OptionalDateField label={RENT_MANAGE_MESSAGES.start} onChange={setStartDate} required startsAt={new Date()} value={startDate} />
        </>
      )}

      <OptionalDateField
        error={isEnding ? RENT_MANAGE_MESSAGES.endBeforeStart : undefined}
        label={RENT_MANAGE_MESSAGES.end}
        onChange={setEndDate}
        startsAt={startDate ? dateFromIso(startDate) : new Date()}
        value={endDate}
      />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RENT_MANAGE_MESSAGES.endHint}</Text>

      <FormField
        editable={!busy}
        error={isGraceValid ? undefined : RENT_MANAGE_MESSAGES.graceInvalid}
        hint={RENT_MANAGE_MESSAGES.graceHint}
        keyboardType="number-pad"
        label={RENT_MANAGE_MESSAGES.grace}
        onChangeText={setGraceDays}
        value={graceDays}
      />

      <FormField
        editable={!busy}
        inputStyle={{ minHeight: 72, textAlignVertical: "top" }}
        label={RENT_MANAGE_MESSAGES.notes}
        multiline
        onChangeText={setNotes}
        value={notes}
      />

      <LoadingButton disabled={!canSave || isRemoving} isLoading={isBusy && !isRemoving} loadingText={RENT_MANAGE_MESSAGES.saving} onPress={() => void save()}>
        {existing ? RENT_MANAGE_MESSAGES.saveEdit : RENT_MANAGE_MESSAGES.saveNew}
      </LoadingButton>
      {existing ? (
        <LoadingButton
          disabled={isBusy && !isRemoving}
          isLoading={isRemoving}
          loadingText={RENT_MANAGE_MESSAGES.removing}
          onPress={() =>
            askOnce(asking, RENT_MANAGE_MESSAGES.removeScheduleTitle, RENT_MANAGE_MESSAGES.removeScheduleBody, {
              text: RENT_MANAGE_MESSAGES.confirmRemove,
              style: "destructive",
              onPress: () => void remove(),
            })
          }
          variant="destructive"
        >
          {RENT_MANAGE_MESSAGES.removeSchedule}
        </LoadingButton>
      ) : null}
      <LoadingButton disabled={busy} onPress={close} variant="ghost">
        {RENT_MANAGE_MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
