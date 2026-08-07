import { Button, LoadingButton } from "@platform/ui";

export interface UtilityPlanFormActionsProps {
  isSaving: boolean;
  saveLabel: string;
  onCancel: () => void;
}

/** Cancel + save footer shared by the add and edit utility-plan dialogs. */
export default function UtilityPlanFormActions({
  isSaving,
  saveLabel,
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
        data-testid="utility-plan-save-button"
      >
        {saveLabel}
      </LoadingButton>
    </div>
  );
}
