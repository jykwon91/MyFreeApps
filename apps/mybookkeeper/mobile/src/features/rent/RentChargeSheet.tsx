import { RENT_CHARGE_TYPE_LABEL, RENT_MANUAL_CHARGE_TYPES } from "@mybookkeeper/api-client/constants/rentLabels";
import { useCreateRentChargeMutation } from "@mybookkeeper/api-client/store/rentLedgerApi";
import type { RentChargeType } from "@mybookkeeper/api-client/types/rent/rent-charge-type";
import { isPositiveAmount } from "@mybookkeeper/api-client/utils/rentScheduleForm";
import { FormField, FormSheet, LoadingButton, OptionRow, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { RENT_DESCRIPTION_MAX_LENGTH, RENT_MANAGE_MESSAGES } from "../../constants/rentManage";
import OptionalDateField from "../shell/OptionalDateField";
import { useFormSubmit } from "../shell/useFormSubmit";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { rentWriteFailure } from "./rentWriteFailure";

/** A one-off charge (late fee, utilities, deposit). It settles from the same payments as rent, oldest due date first. */
export default function RentChargeSheet({ applicantId, onClose }: { applicantId: string; onClose: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [createCharge] = useCreateRentChargeMutation();
  const { isBusy, failure, submit } = useFormSubmit();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [kind, setKind] = useState<RentChargeType>("late_fee");
  const [description, setDescription] = useState("");
  const canSave = dueDate !== null && isPositiveAmount(amount);
  const hasChanges = amount !== "" || dueDate !== null || description !== "" || kind !== "late_fee";

  function close(): void {
    if (isBusy) return;
    if (hasChanges) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    if (!dueDate || !canSave) return;
    const landed = await submit(
      () => createCharge({ applicant_id: applicantId, amount, due_date: dueDate, charge_type: kind, description: description.trim() || null }).unwrap(),
      (error) => rentWriteFailure(error, "charge"),
    );
    if (!landed) return;
    onClose();
    showToast(RENT_MANAGE_MESSAGES.chargeAdded);
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={RENT_MANAGE_MESSAGES.chargeTitle}>
      <FormField editable={!isBusy} keyboardType="decimal-pad" label={RENT_MANAGE_MESSAGES.chargeAmount} onChangeText={setAmount} required value={amount} />
      <OptionalDateField label={RENT_MANAGE_MESSAGES.chargeDue} onChange={setDueDate} required startsAt={new Date()} value={dueDate} />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RENT_MANAGE_MESSAGES.chargeDueHint}</Text>

      <View accessibilityLabel={RENT_MANAGE_MESSAGES.chargeKind} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{RENT_MANAGE_MESSAGES.chargeKind}</Text>
        {RENT_MANUAL_CHARGE_TYPES.map((choice) => (
          <OptionRow
            isSelected={kind === choice}
            key={choice}
            label={RENT_CHARGE_TYPE_LABEL[choice]}
            onPress={() => {
              if (!isBusy) setKind(choice);
            }}
          />
        ))}
      </View>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RENT_MANAGE_MESSAGES.chargeKindHint}</Text>

      <FormField
        editable={!isBusy}
        hint={RENT_MANAGE_MESSAGES.chargeDescriptionHint}
        label={RENT_MANAGE_MESSAGES.chargeDescription}
        maxLength={RENT_DESCRIPTION_MAX_LENGTH}
        onChangeText={setDescription}
        value={description}
      />

      <LoadingButton disabled={!canSave} isLoading={isBusy} loadingText={RENT_MANAGE_MESSAGES.adding} onPress={() => void save()}>
        {RENT_MANAGE_MESSAGES.addCharge}
      </LoadingButton>
      <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
        {RENT_MANAGE_MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
