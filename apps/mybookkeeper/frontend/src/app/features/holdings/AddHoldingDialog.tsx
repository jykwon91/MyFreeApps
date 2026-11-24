import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { showError, showSuccess } from "@platform/ui";
import { useCreateHoldingMutation } from "@mybookkeeper/api-client/store/holdingsApi";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import { emptyHoldingForm, toHoldingCreateRequest } from "@mybookkeeper/api-client/utils/holdingForm";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import HoldingDialogActions from "./HoldingDialogActions";
import HoldingFormFields from "./HoldingFormFields";
import { holdingWriteError } from "./holding-write-error";
import { useHoldingForm } from "./useHoldingForm";

export interface AddHoldingDialogProps {
  accounts: FinancialAccount[];
  /** Pre-picked when the page is narrowed to one of these accounts, or there is only one. */
  defaultAccountId: string | null;
  onClose: () => void;
}

export default function AddHoldingDialog({ accounts, defaultAccountId, onClose }: AddHoldingDialogProps) {
  const [createHolding, { isLoading }] = useCreateHoldingMutation();
  const form = useHoldingForm(emptyHoldingForm(defaultAccountId ?? ""));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.passes()) return;
    try {
      await createHolding(toHoldingCreateRequest(form.values, NUMBER_INPUT_DECIMAL_SEPARATOR)).unwrap();
      showSuccess(MSG.added);
      onClose();
    } catch (err) {
      showError(holdingWriteError(err));
    }
  }

  return (
    <FormDialogShell title={MSG.addTitle} testId="add-holding-dialog" onClose={onClose} width="wide">
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <HoldingFormFields values={form.values} onChange={form.setField} problems={form.problems} accounts={accounts} />
        <HoldingDialogActions onCancel={onClose} isSaving={isLoading} saveLabel={MSG.save} />
      </form>
    </FormDialogShell>
  );
}
