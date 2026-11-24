import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import { LoadingRegion } from "@platform/ui";
import { useListFinancialAccountsQuery } from "@mybookkeeper/api-client/store/financialAccountsApi";
import type { TransactionAccountField } from "@/shared/types/transaction/transaction-account-field";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import { TRANSACTION_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/transaction-account-messages";
import TransactionAccountSelect from "./TransactionAccountSelect";

export interface TransactionAccountFieldsProps {
  register: UseFormRegister<TransactionFormValues>;
  watch: UseFormWatch<TransactionFormValues>;
  /** The edit panel outlines changed fields; the new-transaction form doesn't. */
  selectClass?: (name: TransactionAccountField) => string;
  dirtyFields?: Partial<Record<keyof TransactionFormValues, boolean>>;
}

function plainSelectClass(): string {
  return "w-full";
}

/**
 * Which account the money moved in. A transfer names both sides: the account
 * it left and the one it arrived in. Closed accounts aren't offered, except the
 * one a transaction already names, so editing an old row never drops it.
 */
export default function TransactionAccountFields({
  register,
  watch,
  selectClass = plainSelectClass,
  dirtyFields = {},
}: TransactionAccountFieldsProps) {
  const { data, isLoading, isError } = useListFinancialAccountsQuery();
  const isTransfer = watch("transaction_type") === "transfer";
  const accounts = data?.items ?? [];

  if (isLoading) {
    return (
      <LoadingRegion
        label={MSG.loading}
        className="h-10 w-full bg-muted/40 rounded-md animate-pulse"
        data-testid="transaction-account-select-skeleton"
      />
    );
  }

  return (
    <>
      <TransactionAccountSelect
        name="account_id"
        label={isTransfer ? MSG.fromLabel : MSG.label}
        testId="transaction-account-select"
        register={register}
        value={watch("account_id")}
        accounts={accounts}
        className={selectClass("account_id")}
        dirty={!!dirtyFields.account_id}
        loadFailed={isError}
      />
      {isTransfer ? (
        <TransactionAccountSelect
          name="transfer_to_account_id"
          label={MSG.toLabel}
          testId="transaction-transfer-to-select"
          register={register}
          value={watch("transfer_to_account_id")}
          accounts={accounts}
          className={selectClass("transfer_to_account_id")}
          dirty={!!dirtyFields.transfer_to_account_id}
          loadFailed={false}
        />
      ) : null}
    </>
  );
}
