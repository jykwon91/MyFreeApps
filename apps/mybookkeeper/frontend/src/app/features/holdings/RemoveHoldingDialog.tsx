import { ConfirmDialog, showError, showSuccess } from "@platform/ui";
import { useDeleteHoldingMutation } from "@mybookkeeper/api-client/store/holdingsApi";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

export interface RemoveHoldingDialogProps {
  holding: Holding;
  onClose: () => void;
}

export default function RemoveHoldingDialog({ holding, onClose }: RemoveHoldingDialogProps) {
  const [deleteHolding, { isLoading }] = useDeleteHoldingMutation();

  async function handleRemove() {
    try {
      await deleteHolding(holding.id).unwrap();
      showSuccess(MSG.removed);
      onClose();
    } catch {
      showError(MSG.removeFailed);
    }
  }

  return (
    <ConfirmDialog
      open
      title={MSG.removeTitle}
      description={MSG.removeDescription}
      confirmLabel={MSG.remove}
      variant="destructive"
      isLoading={isLoading}
      onConfirm={() => void handleRemove()}
      onCancel={onClose}
    />
  );
}
