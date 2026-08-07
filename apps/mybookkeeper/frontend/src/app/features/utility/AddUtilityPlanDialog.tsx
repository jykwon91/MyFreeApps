import { useState } from "react";
import FormField from "@/shared/components/ui/FormField";
import {
  toUtilityPlanFields,
  validateUtilityPlanForm,
} from "@/shared/lib/utility-plan-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useCreateUtilityPlanMutation } from "@/shared/store/utilityPlansApi";
import UtilityPlanDialogShell from "./UtilityPlanDialogShell";
import UtilityPlanFormActions from "./UtilityPlanFormActions";
import UtilityPlanFormFields, { UTILITY_PLAN_INPUT_CLASS } from "./UtilityPlanFormFields";
import { useUtilityPlanForm } from "./useUtilityPlanForm";

export interface AddUtilityPlanDialogProps {
  onClose: () => void;
}

/** Modal dialog for recording a utility plan against a property. */
export default function AddUtilityPlanDialog({ onClose }: AddUtilityPlanDialogProps) {
  const { data: properties = [] } = useGetPropertiesQuery();
  const [createPlan, { isLoading }] = useCreateUtilityPlanMutation();
  const { values, setField } = useUtilityPlanForm();
  const [propertyId, setPropertyId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) {
      showError("Pick a property.");
      return;
    }
    const problem = validateUtilityPlanForm(values);
    if (problem) {
      showError(problem);
      return;
    }

    try {
      await createPlan({
        property_id: propertyId,
        ...toUtilityPlanFields(values),
      }).unwrap();
      showSuccess("Utility plan added.");
      onClose();
    } catch {
      showError("Couldn't save the plan. Please try again.");
    }
  }

  return (
    <UtilityPlanDialogShell
      title="Add utility plan"
      testId="add-utility-plan-dialog"
      onClose={onClose}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <FormField label="Property" required>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className={UTILITY_PLAN_INPUT_CLASS}
            required
            data-testid="utility-plan-property-select"
          >
            <option value="">Select a property…</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </FormField>

        <UtilityPlanFormFields values={values} setField={setField} />

        <UtilityPlanFormActions
          isSaving={isLoading}
          saveLabel="Save plan"
          onCancel={onClose}
        />
      </form>
    </UtilityPlanDialogShell>
  );
}
