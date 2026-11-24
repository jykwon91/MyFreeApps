import { Button, LoadingButton } from "@platform/ui";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

export interface HoldingDialogActionsProps {
  onCancel: () => void;
  isSaving: boolean;
  saveLabel: string;
}

export default function HoldingDialogActions({ onCancel, isSaving, saveLabel }: HoldingDialogActionsProps) {
  return (
    <div className="flex gap-3 justify-end pt-2">
      <Button type="button" variant="secondary" size="md" onClick={onCancel}>
        Cancel
      </Button>
      <LoadingButton
        type="submit"
        variant="primary"
        size="md"
        isLoading={isSaving}
        loadingText={MSG.saving}
        data-testid="holding-save-button"
      >
        {saveLabel}
      </LoadingButton>
    </div>
  );
}
