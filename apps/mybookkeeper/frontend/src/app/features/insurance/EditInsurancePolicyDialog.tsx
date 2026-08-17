import { useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import { policyToFormValues, toPolicyPayload } from "@/shared/lib/insurance-policy-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateInsurancePolicyMutation } from "@/shared/store/insurancePoliciesApi";
import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";
import type { InsurancePolicyFormValues } from "@/shared/types/insurance/insurance-policy-form-values";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import InsurancePolicyFormFields from "./InsurancePolicyFormFields";

export interface EditInsurancePolicyDialogProps {
  policy: InsurancePolicyDetail;
  onClose: () => void;
}

/**
 * Modal dialog for correcting a stored policy.
 *
 * Premiums move at every renewal, so a policy recorded once and never editable
 * would go stale the first time the carrier repriced it — and the operator's
 * only recourse would be to delete the row, taking its attachments with it.
 */
export default function EditInsurancePolicyDialog({
  policy,
  onClose,
}: EditInsurancePolicyDialogProps) {
  const [updatePolicy, { isLoading }] = useUpdateInsurancePolicyMutation();
  const [values, setValues] = useState<InsurancePolicyFormValues>(() =>
    policyToFormValues(policy),
  );

  function handleChange<K extends keyof InsurancePolicyFormValues>(
    field: K,
    value: InsurancePolicyFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.policyName.trim()) {
      showError("Policy name is required.");
      return;
    }

    try {
      await updatePolicy({
        policyId: policy.id,
        data: toPolicyPayload(values),
      }).unwrap();
      showSuccess("Insurance policy updated.");
      onClose();
    } catch {
      showError("Couldn't save the policy. Please try again.");
    }
  }

  return (
    <FormDialogShell
      title="Edit insurance policy"
      testId="edit-insurance-policy-dialog"
      onClose={onClose}
      width="wide"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <InsurancePolicyFormFields values={values} onChange={handleChange} />

        <div className="flex gap-3 pt-2 justify-end">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            loadingText="Saving..."
            data-testid="insurance-policy-update-button"
          >
            Save changes
          </LoadingButton>
        </div>
      </form>
    </FormDialogShell>
  );
}
