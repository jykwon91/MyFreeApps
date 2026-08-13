import { useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import { applyDraftToForm } from "@/shared/lib/insurance-policy-draft";
import { EMPTY_POLICY_FORM, toPolicyPayload } from "@/shared/lib/insurance-policy-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateInsurancePolicyMutation } from "@/shared/store/insurancePoliciesApi";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";
import type { InsurancePolicyFormValues } from "@/shared/types/insurance/insurance-policy-form-values";
import InsurancePolicyDialogShell from "./InsurancePolicyDialogShell";
import InsurancePolicyDocumentReader from "./InsurancePolicyDocumentReader";
import InsurancePolicyDraftNotices from "./InsurancePolicyDraftNotices";
import InsurancePolicyFormFields from "./InsurancePolicyFormFields";

export interface AddInsurancePolicyDialogProps {
  listingId: string;
  onClose: () => void;
}

/**
 * Modal dialog for creating a new insurance policy on a listing.
 */
export default function AddInsurancePolicyDialog({
  listingId,
  onClose,
}: AddInsurancePolicyDialogProps) {
  const [createPolicy, { isLoading }] = useCreateInsurancePolicyMutation();
  const [values, setValues] = useState<InsurancePolicyFormValues>(EMPTY_POLICY_FORM);
  const [draft, setDraft] = useState<InsurancePolicyDraft | null>(null);

  function handleChange<K extends keyof InsurancePolicyFormValues>(
    field: K,
    value: InsurancePolicyFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleRead(read: InsurancePolicyDraft) {
    setDraft(read);
    setValues((current) => applyDraftToForm(current, read));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.policyName.trim()) {
      showError("Policy name is required.");
      return;
    }

    try {
      await createPolicy({
        listing_id: listingId,
        ...toPolicyPayload(values),
        // Recorded only when the form was actually seeded from a document, so
        // the saved policy points back at what it was read from.
        ...(draft ? { source_document_id: draft.source_document_id } : {}),
      }).unwrap();
      showSuccess("Insurance policy added.");
      onClose();
    } catch {
      showError("Couldn't save the policy. Please try again.");
    }
  }

  return (
    <InsurancePolicyDialogShell
      title="Add insurance policy"
      testId="add-insurance-policy-dialog"
      onClose={onClose}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <InsurancePolicyDocumentReader onRead={handleRead} />
        {draft && <InsurancePolicyDraftNotices draft={draft} />}

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
            data-testid="insurance-policy-save-button"
          >
            Save policy
          </LoadingButton>
        </div>
      </form>
    </InsurancePolicyDialogShell>
  );
}
