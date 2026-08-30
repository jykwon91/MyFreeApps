import { useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import Select from "@/shared/components/ui/Select";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { useCreateRentChargeMutation } from "@/shared/store/rentLedgerApi";
import { RENT_INPUT_CLASS } from "./rent-input-class";
import { RENT_CHARGE_TYPE_LABEL, RENT_MANUAL_CHARGE_TYPES } from "./rent-labels";
import type { RentChargeType } from "@/shared/types/rent/rent-charge-type";

export interface RentChargeDialogProps {
  applicantId: string;
  onClose: () => void;
}

/**
 * Adds a one-off charge — a late fee, a utility reimbursement, a deposit.
 *
 * It settles from the same payments as rent, in due-date order, so a late fee
 * dated before the next rent period is paid off first. That is the point of
 * putting it in the ledger rather than tracking it on the side: one balance,
 * one set of payments.
 */
export default function RentChargeDialog({
  applicantId,
  onClose,
}: RentChargeDialogProps) {
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [chargeType, setChargeType] = useState<RentChargeType>("late_fee");
  const [description, setDescription] = useState("");
  const [create, { isLoading }] = useCreateRentChargeMutation();

  const parsed = parseFloat(amount);
  const canSubmit = Boolean(dueDate) && Number.isFinite(parsed) && parsed > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await create({
        applicant_id: applicantId,
        amount,
        due_date: dueDate,
        charge_type: chargeType,
        description: description.trim() || null,
      }).unwrap();
      showSuccess("Charge added.");
      onClose();
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  return (
    <FormDialogShell
      title="Add a charge"
      testId="rent-charge-dialog"
      onClose={onClose}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="rent-charge-amount"
              className="block text-sm font-medium mb-1"
            >
              Amount ($)
            </label>
            <input
              id="rent-charge-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={RENT_INPUT_CLASS}
              data-testid="rent-charge-amount"
              required
            />
          </div>

          <div>
            <label
              htmlFor="rent-charge-due"
              className="block text-sm font-medium mb-1"
            >
              Due
            </label>
            <input
              id="rent-charge-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={RENT_INPUT_CLASS}
              data-testid="rent-charge-due"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Payments settle charges oldest first, so this sets its place in
              the queue.
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="rent-charge-type"
            className="block text-sm font-medium mb-1"
          >
            Kind
          </label>
          <Select
            id="rent-charge-type"
            value={chargeType}
            onChange={(e) => setChargeType(e.target.value as RentChargeType)}
            className={RENT_INPUT_CLASS}
            data-testid="rent-charge-type"
          >
            {RENT_MANUAL_CHARGE_TYPES.map((option) => (
              <option key={option} value={option}>
                {RENT_CHARGE_TYPE_LABEL[option]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Rent itself is not listed — it comes from the schedule, so adding it
            here would bill the period twice.
          </p>
        </div>

        <div>
          <label
            htmlFor="rent-charge-description"
            className="block text-sm font-medium mb-1"
          >
            Description
          </label>
          <input
            id="rent-charge-description"
            type="text"
            maxLength={255}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="August electricity share"
            className={RENT_INPUT_CLASS}
            data-testid="rent-charge-description"
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
            loadingText="Adding..."
            disabled={!canSubmit}
            data-testid="rent-charge-save-button"
          >
            Add charge
          </LoadingButton>
        </div>
      </form>
    </FormDialogShell>
  );
}
