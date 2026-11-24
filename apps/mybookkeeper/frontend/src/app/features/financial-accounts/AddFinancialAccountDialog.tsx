import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { showError, showSuccess } from "@platform/ui";
import { useCreateFinancialAccountMutation } from "@mybookkeeper/api-client/store/financialAccountsApi";
import { EMPTY_FINANCIAL_ACCOUNT_FORM, toFinancialAccountPayload } from "@mybookkeeper/api-client/utils/financialAccountForm";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import FinancialAccountDialogActions from "./FinancialAccountDialogActions";
import FinancialAccountFormFields from "./FinancialAccountFormFields";
import { useFinancialAccountForm } from "./useFinancialAccountForm";

export interface AddFinancialAccountDialogProps {
  onClose: () => void;
}

export default function AddFinancialAccountDialog({ onClose }: AddFinancialAccountDialogProps) {
  const [createAccount, { isLoading }] = useCreateFinancialAccountMutation();
  const form = useFinancialAccountForm(EMPTY_FINANCIAL_ACCOUNT_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.passes()) return;
    try {
      await createAccount(toFinancialAccountPayload(form.values, NUMBER_INPUT_DECIMAL_SEPARATOR)).unwrap();
      showSuccess(MSG.added);
      onClose();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.saveFailed));
    }
  }

  return (
    <FormDialogShell title={MSG.addTitle} testId="add-financial-account-dialog" onClose={onClose} width="wide">
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <FinancialAccountFormFields values={form.values} onChange={form.setField} problems={form.problems} />
        <FinancialAccountDialogActions onCancel={onClose} isSaving={isLoading} saveLabel="Save account" />
      </form>
    </FormDialogShell>
  );
}
