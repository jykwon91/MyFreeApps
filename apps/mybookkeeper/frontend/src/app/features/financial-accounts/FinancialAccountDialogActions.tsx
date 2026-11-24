import { Button, LoadingButton } from "@platform/ui";

export interface FinancialAccountDialogActionsProps {
  onCancel: () => void;
  isSaving: boolean;
  saveLabel: string;
  /** Extra actions on the left, such as Close account and Delete. */
  children?: React.ReactNode;
}

export default function FinancialAccountDialogActions({ onCancel, isSaving, saveLabel, children }: FinancialAccountDialogActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">{children}</div>
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="secondary" size="md" onClick={onCancel}>
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSaving}
          loadingText="Saving..."
          data-testid="financial-account-save-button"
        >
          {saveLabel}
        </LoadingButton>
      </div>
    </div>
  );
}
