import { Button, LoadingButton } from "@platform/ui";

export interface UtilityPlanFormActionsProps {
  isSaving: boolean;
  saveLabel: string;
  /** Blocks submit while the form is incomplete, alongside the saving state. */
  disabled?: boolean;
  onCancel: () => void;
}

/** Cancel + save footer shared by the add and edit utility-plan dialogs. */
export default function UtilityPlanFormActions({
  isSaving,
  saveLabel,
  disabled = false,
  onCancel,
}: UtilityPlanFormActionsProps) {
  return (
    <div className="flex gap-3 pt-2 justify-end">
      <Button type="button" variant="secondary" size="md" onClick={onCancel}>
        Cancel
      </Button>
      <LoadingButton
        type="submit"
        variant="primary"
        size="md"
        isLoading={isSaving}
        loadingText="Saving..."
        disabled={disabled || isSaving}
        data-testid="utility-plan-save-button"
      >
        {saveLabel}
      </LoadingButton>
    </div>
  );
}
