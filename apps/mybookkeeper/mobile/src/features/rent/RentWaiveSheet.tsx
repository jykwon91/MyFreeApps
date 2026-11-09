import { useWaiveRentChargeMutation } from "@mybookkeeper/api-client/store/rentLedgerApi";
import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import { formatCurrency } from "@platform/core/utils/currency";
import { FormField, FormSheet, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { RENT_MANAGE_MESSAGES, RENT_WAIVE_REASON_MAX_LENGTH, waiveBody } from "../../constants/rentManage";
import { shortDate } from "../transactions/transactionDisplay";
import { useFormSubmit } from "../shell/useFormSubmit";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { rentWriteFailure } from "./rentWriteFailure";

/** A waiver moves the balance, so its reason is required and stays with the charge. */
export default function RentWaiveSheet({ applicantId, charge, onClose }: { applicantId: string; charge: RentCharge; onClose: () => void }) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [waiveCharge] = useWaiveRentChargeMutation();
  const { isBusy, failure, submit } = useFormSubmit();
  const [reason, setReason] = useState("");
  const canSave = reason.trim().length > 0;

  function close(): void {
    if (isBusy) return;
    if (reason) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    if (!canSave) return;
    const landed = await submit(() => waiveCharge({ chargeId: charge.id, applicantId, reason: reason.trim() }).unwrap(), (error) => rentWriteFailure(error, "other"));
    if (!landed) return;
    onClose();
    showToast(RENT_MANAGE_MESSAGES.chargeWaived);
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={close} title={RENT_MANAGE_MESSAGES.waiveTitle}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {waiveBody(formatCurrency(charge.amount), `${shortDate(charge.period_start)} – ${shortDate(charge.period_end)}`)}
      </Text>
      <FormField
        editable={!isBusy}
        hint={`${RENT_MANAGE_MESSAGES.waiveReasonHint} ${reason.length}/${RENT_WAIVE_REASON_MAX_LENGTH}`}
        inputStyle={{ minHeight: 96, textAlignVertical: "top" }}
        label={RENT_MANAGE_MESSAGES.waiveReason}
        maxLength={RENT_WAIVE_REASON_MAX_LENGTH}
        multiline
        onChangeText={setReason}
        required
        value={reason}
      />
      <LoadingButton disabled={!canSave} isLoading={isBusy} loadingText={RENT_MANAGE_MESSAGES.waiving} onPress={() => void save()}>
        {RENT_MANAGE_MESSAGES.waiveCharge}
      </LoadingButton>
      <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
        {RENT_MANAGE_MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
