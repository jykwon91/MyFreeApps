import { useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import FormField from "@/shared/components/ui/FormField";
import { applyMortgageDraftToForm } from "@/shared/lib/mortgage-draft";
import { EMPTY_MORTGAGE_FORM, toMortgagePayload } from "@/shared/lib/mortgage-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateMortgageMutation } from "@/shared/store/mortgagesApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import type { MortgageDraft } from "@/shared/types/mortgage/mortgage-draft";
import type { MortgageFormValues } from "@/shared/types/mortgage/mortgage-form-values";
import MortgageDocumentReader from "./MortgageDocumentReader";
import MortgageDraftNotices from "./MortgageDraftNotices";
import MortgageFormFields from "./MortgageFormFields";
import { MORTGAGE_INPUT_CLASS } from "./mortgage-input-class";

export interface AddMortgageDialogProps {
  onClose: () => void;
}

/** Modal dialog for recording a mortgage against a property. */
export default function AddMortgageDialog({ onClose }: AddMortgageDialogProps) {
  const { data: properties = [] } = useGetPropertiesQuery();
  const [createMortgage, { isLoading }] = useCreateMortgageMutation();
  const [values, setValues] = useState<MortgageFormValues>(EMPTY_MORTGAGE_FORM);
  const [propertyId, setPropertyId] = useState("");
  const [draft, setDraft] = useState<MortgageDraft | null>(null);

  function handleChange<K extends keyof MortgageFormValues>(
    field: K,
    value: MortgageFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleRead(read: MortgageDraft) {
    setDraft(read);
    setValues((current) => applyMortgageDraftToForm(current, read));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) {
      showError("Pick a property.");
      return;
    }
    if (!values.rateType) {
      showError("Pick whether the rate is fixed or adjustable.");
      return;
    }

    try {
      await createMortgage({
        property_id: propertyId,
        ...toMortgagePayload(values),
        // Recorded only when the form was actually seeded from a statement, so
        // the saved loan points back at what it was read from.
        ...(draft ? { source_document_id: draft.source_document_id } : {}),
      }).unwrap();
      showSuccess("Mortgage added.");
      onClose();
    } catch {
      showError("Couldn't save the mortgage. Please try again.");
    }
  }

  return (
    <FormDialogShell
      title="Add mortgage"
      testId="add-mortgage-dialog"
      onClose={onClose}
      width="wide"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <MortgageDocumentReader onRead={handleRead} />
        {draft && <MortgageDraftNotices draft={draft} />}

        <FormField label="Property" required>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className={MORTGAGE_INPUT_CLASS}
            required
            data-testid="mortgage-property-select"
          >
            <option value="">Select a property…</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </FormField>

        <MortgageFormFields values={values} onChange={handleChange} />

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
            data-testid="mortgage-save-button"
          >
            Save mortgage
          </LoadingButton>
        </div>
      </form>
    </FormDialogShell>
  );
}
