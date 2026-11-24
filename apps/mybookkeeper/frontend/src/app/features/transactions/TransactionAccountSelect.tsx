import type { UseFormRegister } from "react-hook-form";
import { FormField } from "@platform/ui";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import { financialAccountLabel } from "@mybookkeeper/api-client/utils/financialAccountLabel";
import { selectableFinancialAccounts } from "@mybookkeeper/api-client/utils/groupFinancialAccounts";
import type { TransactionAccountField } from "@/shared/types/transaction/transaction-account-field";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import Select from "@/shared/components/ui/Select";
import { TRANSACTION_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/transaction-account-messages";

export interface TransactionAccountSelectProps {
  name: TransactionAccountField;
  label: string;
  testId: string;
  register: UseFormRegister<TransactionFormValues>;
  /** The form's current value for ``name``. */
  value: string;
  accounts: readonly FinancialAccount[];
  className: string;
  dirty: boolean;
  loadFailed: boolean;
}

export default function TransactionAccountSelect({
  name, label, testId, register, value, accounts, className, dirty, loadFailed,
}: TransactionAccountSelectProps) {
  return (
    <FormField label={label} dirty={dirty}>
      {(field) => (
        <>
          <Select
            {...register(name)}
            // Controlled, so an account read in after the first render still shows as picked.
            value={value}
            className={className}
            data-testid={testId}
            {...field}
          >
            <option value="">{MSG.none}</option>
            {selectableFinancialAccounts(accounts, value || null).map((account) => (
              <option key={account.id} value={account.id}>{financialAccountLabel(account)}</option>
            ))}
          </Select>
          {loadFailed ? <p className="text-xs text-destructive mt-1">{MSG.loadFailed}</p> : null}
        </>
      )}
    </FormField>
  );
}
