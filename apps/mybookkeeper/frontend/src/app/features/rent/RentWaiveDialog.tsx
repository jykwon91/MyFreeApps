import { useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { useWaiveRentChargeMutation } from "@/shared/store/rentLedgerApi";
import { RENT_INPUT_CLASS } from "./rent-input-class";
import { formatCurrency } from "@/shared/utils/currency";
import { formatShortDate } from "@/shared/lib/inquiry-date-format";
import type { RentCharge } from "@/shared/types/rent/rent-charge";

export interface RentWaiveDialogProps {
  charge: RentCharge;
  applicantId: string;
  onClose: () => void;
}

/**
 * Waives a charge, with a required reason.
 *
 * A waiver moves the balance, so it is the one ledger action whose motivation
 * has to survive to whoever reads the account next — a period showing zero
 * owed with no explanation is indistinguishable from a bug.
 */
export default function RentWaiveDialog({
  charge,
  applicantId,
  onClose,
}: RentWaiveDialogProps) {
  const [reason, setReason] = useState("");
  const [waive, { isLoading }] = useWaiveRentChargeMutation();
  const canSubmit = reason.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await waive({ chargeId: charge.id, applicantId, reason: reason.trim() }).unwrap();
      showSuccess("Charge waived.");
      onClose();
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  return (
    <FormDialogShell
      title="Waive this charge"
      testId="rent-waive-dialog"
      onClose={onClose}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatCurrency(charge.amount)} for{" "}
          {formatShortDate(charge.period_start)} –{" "}
          {formatShortDate(charge.period_end)} stops counting toward the
          balance. Payments already applied to it move on to the next unpaid
          charge.
        </p>

        <div>
          <label
            htmlFor="rent-waive-reason"
            className="block text-sm font-medium mb-1"
          >
            Reason
          </label>
          <textarea
            id="rent-waive-reason"
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Agreed to skip the first week while the room was being repainted."
            className={`${RENT_INPUT_CLASS} resize-none`}
            data-testid="rent-waive-reason"
            required
          />
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            loadingText="Waiving..."
            disabled={!canSubmit}
            data-testid="rent-waive-save-button"
          >
            Waive charge
          </LoadingButton>
        </div>
      </form>
    </FormDialogShell>
  );
}
