import { format } from "date-fns";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { showError, showSuccess } from "@platform/ui";
import { useUpdateFinancialAccountMutation } from "@mybookkeeper/api-client/store/financialAccountsApi";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import { financialAccountLabel } from "@mybookkeeper/api-client/utils/financialAccountLabel";
import {
  balanceTextToCents,
  centsToBalanceText,
  financialAccountToFormValues,
} from "@mybookkeeper/api-client/utils/financialAccountForm";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import FinancialAccountBalanceFields from "./FinancialAccountBalanceFields";
import FinancialAccountDialogActions from "./FinancialAccountDialogActions";
import { useFinancialAccountForm } from "./useFinancialAccountForm";

export interface UpdateBalanceDialogProps {
  account: FinancialAccount;
  onClose: () => void;
}

/** The quick path for the most common edit: today's balance, dated today unless changed. */
export default function UpdateBalanceDialog({ account, onClose }: UpdateBalanceDialogProps) {
  const [updateAccount, { isLoading }] = useUpdateFinancialAccountMutation();
  const form = useFinancialAccountForm({
    ...financialAccountToFormValues(account),
    balanceDollars: centsToBalanceText(account.current_balance_cents),
    balanceAsOf: format(new Date(), "yyyy-MM-dd"),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.passes()) return;
    const cents = balanceTextToCents(form.values.balanceDollars, NUMBER_INPUT_DECIMAL_SEPARATOR) ?? null;
    try {
      await updateAccount({
        accountId: account.id,
        data: { current_balance_cents: cents, balance_as_of: cents === null ? null : form.values.balanceAsOf },
      }).unwrap();
      showSuccess(MSG.balanceSaved);
      onClose();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.saveFailed));
    }
  }

  return (
    <FormDialogShell title={MSG.balanceTitle} testId="update-balance-dialog" onClose={onClose}>
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <p className="text-sm font-medium">{financialAccountLabel(account)}</p>
        <FinancialAccountBalanceFields values={form.values} onChange={form.setField} problems={form.problems} />
        <FinancialAccountDialogActions onCancel={onClose} isSaving={isLoading} saveLabel="Save balance" />
      </form>
    </FormDialogShell>
  );
}
