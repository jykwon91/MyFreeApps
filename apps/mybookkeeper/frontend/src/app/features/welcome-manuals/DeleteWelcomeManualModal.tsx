import { ConfirmDialog } from "@platform/ui";

export interface DeleteWelcomeManualModalProps {
  open: boolean;
  manualTitle: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteWelcomeManualModal({
  open,
  manualTitle,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteWelcomeManualModalProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Delete this welcome manual?"
      description={
        `"${manualTitle}" will be removed. All sections and photos will be ` +
        "deleted. This can't be undone."
      }
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
