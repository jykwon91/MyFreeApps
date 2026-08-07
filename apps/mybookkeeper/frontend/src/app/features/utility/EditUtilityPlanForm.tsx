import {
  toUtilityPlanFields,
  toUtilityPlanFormValues,
  validateUtilityPlanForm,
} from "@/shared/lib/utility-plan-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateUtilityPlanMutation } from "@/shared/store/utilityPlansApi";
import type { UtilityPlanDetail } from "@/shared/types/utility/utility-plan-detail";
import UtilityPlanFormActions from "./UtilityPlanFormActions";
import UtilityPlanFormFields from "./UtilityPlanFormFields";
import { useUtilityPlanForm } from "./useUtilityPlanForm";

export interface EditUtilityPlanFormProps {
  plan: UtilityPlanDetail;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * The edit dialog's body, mounted only once its plan has loaded.
 *
 * Split from the dialog so the form's initial state can be seeded straight
 * from ``plan`` — the fields are then owned by the operator, and a background
 * refetch cannot overwrite what they have typed.
 */
export default function EditUtilityPlanForm({
  plan,
  onSaved,
  onCancel,
}: EditUtilityPlanFormProps) {
  const [updatePlan, { isLoading }] = useUpdateUtilityPlanMutation();
  const { values, setField } = useUtilityPlanForm(toUtilityPlanFormValues(plan));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateUtilityPlanForm(values);
    if (problem) {
      showError(problem);
      return;
    }

    try {
      await updatePlan({ planId: plan.id, data: toUtilityPlanFields(values) }).unwrap();
      showSuccess("Utility plan updated.");
      onSaved();
    } catch {
      showError("Couldn't save the changes. Please try again.");
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
      {/* The property is fixed for the life of the plan, so it reads as
          context rather than as a field the operator can change. */}
      <p className="text-sm text-muted-foreground" data-testid="edit-utility-plan-property">
        {plan.property_name ?? "Unknown property"}
      </p>

      <UtilityPlanFormFields values={values} setField={setField} />

      <UtilityPlanFormActions
        isSaving={isLoading}
        saveLabel="Save changes"
        onCancel={onCancel}
      />
    </form>
  );
}
