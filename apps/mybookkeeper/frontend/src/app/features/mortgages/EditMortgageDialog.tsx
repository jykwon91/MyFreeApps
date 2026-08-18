import { useState } from "react";
import { Button, ConfirmDialog, LoadingButton } from "@platform/ui";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import {
  mortgageToFormValues,
  toMortgagePayload,
} from "@/shared/lib/mortgage-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteMortgageMutation,
  useUpdateMortgageMutation,
} from "@/shared/store/mortgagesApi";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";
import type { MortgageFormValues } from "@/shared/types/mortgage/mortgage-form-values";
import MortgageFormFields from "./MortgageFormFields";

export interface EditMortgageDialogProps {
  mortgage: Mortgage;
  onClose: () => void;
}

/**
 * Edit a recorded loan.
 *
 * No document reader here. A statement re-read against an existing loan would
 * have to decide which of the two balances is current, and the answer depends
 * on a statement date the reader may not have found — so re-reading is done by
 * recording the newer statement, not by overwriting in place.
 */
export default function EditMortgageDialog({
  mortgage,
  onClose,
}: EditMortgageDialogProps) {
  const [updateMortgage, { isLoading }] = useUpdateMortgageMutation();
  const [deleteMortgage, { isLoading: isDeleting }] = useDeleteMortgageMutation();
  const [values, setValues] = useState<MortgageFormValues>(
    mortgageToFormValues(mortgage),
  );
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  function handleChange<K extends keyof MortgageFormValues>(
    field: K,
    value: MortgageFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.rateType) {
      showError("Pick whether the rate is fixed or adjustable.");
      return;
    }
    try {
      await updateMortgage({
        mortgageId: mortgage.id,
        data: toMortgagePayload(values),
      }).unwrap();
      showSuccess("Mortgage updated.");
      onClose();
    } catch {
      showError("Couldn't save the changes. Please try again.");
    }
  }

  async function handleDelete() {
    try {
      await deleteMortgage(mortgage.id).unwrap();
      showSuccess("Mortgage removed.");
      onClose();
    } catch {
      showError("Couldn't remove the mortgage. Please try again.");
    }
  }

  return (
    <FormDialogShell
      title="Edit mortgage"
      testId="edit-mortgage-dialog"
      onClose={onClose}
      width="wide"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <MortgageFormFields values={values} onChange={handleChange} />

        <div className="flex flex-wrap gap-3 pt-2 justify-between">
          <LoadingButton
            type="button"
            variant="secondary"
            size="md"
            isLoading={isDeleting}
            loadingText="Removing..."
            onClick={() => setConfirmingRemoval(true)}
            data-testid="mortgage-delete-button"
          >
            Remove
          </LoadingButton>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              loadingText="Saving..."
              data-testid="mortgage-update-button"
            >
              Save changes
            </LoadingButton>
          </div>
        </div>
      </form>

      {/* A loan is typed in by hand off a paper statement, so removing one
          costs more to undo than it does to do. Same confirmation the policy
          detail page uses for the same reason. */}
      <ConfirmDialog
        open={confirmingRemoval}
        title="Remove this mortgage?"
        description={
          <>
            This removes the loan on{" "}
            <strong>{mortgage.property_name ?? "this property"}</strong> and it
            will stop being compared against the market.
          </>
        }
        confirmLabel="Remove"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingRemoval(false)}
      />
    </FormDialogShell>
  );
}
