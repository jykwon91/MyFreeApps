import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { showError, showSuccess } from "@platform/ui";
import { useUpdateHoldingMutation } from "@mybookkeeper/api-client/store/holdingsApi";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { holdingToFormValues, toHoldingUpdateRequest } from "@mybookkeeper/api-client/utils/holdingForm";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import HoldingDialogActions from "./HoldingDialogActions";
import HoldingFormFields from "./HoldingFormFields";
import { holdingWriteError } from "./holding-write-error";
import { useHoldingForm } from "./useHoldingForm";

export interface EditHoldingDialogProps {
  holding: Holding;
  onClose: () => void;
}

/** Edit a hand-entered holding. Only what changed is sent, so a new price alone keeps the ticker as it is. */
export default function EditHoldingDialog({ holding, onClose }: EditHoldingDialogProps) {
  const [updateHolding, { isLoading }] = useUpdateHoldingMutation();
  const initial = holdingToFormValues(holding);
  const form = useHoldingForm(initial);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.passes()) return;
    const data = toHoldingUpdateRequest(initial, form.values, NUMBER_INPUT_DECIMAL_SEPARATOR);
    if (Object.keys(data).length === 0) {
      showSuccess(MSG.nothingChanged);
      onClose();
      return;
    }
    try {
      await updateHolding({ holdingId: holding.id, data }).unwrap();
      showSuccess(MSG.saved);
      onClose();
    } catch (err) {
      showError(holdingWriteError(err));
    }
  }

  return (
    <FormDialogShell title={MSG.editTitle} testId="edit-holding-dialog" onClose={onClose} width="wide">
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <HoldingFormFields values={form.values} onChange={form.setField} problems={form.problems} />
        <HoldingDialogActions onCancel={onClose} isSaving={isLoading} saveLabel={MSG.saveChanges} />
      </form>
    </FormDialogShell>
  );
}
