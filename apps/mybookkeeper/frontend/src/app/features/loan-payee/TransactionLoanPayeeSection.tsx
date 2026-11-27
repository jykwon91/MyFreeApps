import { Landmark } from "lucide-react";
import { LoadingButton, Skeleton } from "@platform/ui";
import { LOAN_PAYEE_LABELS as L } from "@mybookkeeper/api-client/constants/loanPayeeLabels";
import { useGetLoanPayeeQuery } from "@mybookkeeper/api-client/store/loanPayeeApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useLoanPayeeActions } from "./useLoanPayeeActions";

export interface TransactionLoanPayeeSectionProps {
  transaction: Transaction;
}

/** On the transaction panel: count every payment to this payee as a mortgage or a loan, or take that back. */
export default function TransactionLoanPayeeSection({ transaction }: TransactionLoanPayeeSectionProps) {
  const canWrite = useCanWrite();
  // Money in, a duplicate and a personal transfer are never money out.
  const eligible =
    canWrite &&
    transaction.transaction_type !== "income" &&
    transaction.status !== "duplicate" &&
    transaction.status !== "personal_transfer";
  const { data, isLoading, isError } = useGetLoanPayeeQuery(transaction.id, { skip: !eligible });
  const { tag, untag, pendingKind, isUntagging } = useLoanPayeeActions();

  if (!eligible) return null;

  if (isLoading) {
    return (
      <div className="px-5 py-4 border-t space-y-2" data-testid="loan-payee-skeleton">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="px-5 py-4 border-t text-xs text-muted-foreground" data-testid="loan-payee-error">
        {L.loadFailed}
      </p>
    );
  }

  if (!data || !data.can_tag) return null;

  if (data.kind !== null) {
    return (
      <div className="px-5 py-4 border-t space-y-3" data-testid="loan-payee-tagged">
        <p className="text-sm">{L.tagged(data.payee, data.kind)}</p>
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          isLoading={isUntagging}
          loadingText={L.untagPending}
          onClick={() => void untag(transaction.id)}
        >
          {L.untag}
        </LoadingButton>
      </div>
    );
  }

  const busy = pendingKind !== null;
  return (
    <div className="px-5 py-4 border-t space-y-2" data-testid="loan-payee-untagged">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{L.heading}</p>
      <p className="text-xs text-muted-foreground">{L.help(data.payee)}</p>
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          isLoading={pendingKind === "mortgage"}
          loadingText={L.tagPending}
          disabled={busy}
          onClick={() => void tag(transaction.id, "mortgage")}
        >
          <Landmark className="h-4 w-4 mr-1" aria-hidden="true" />
          {L.tagMortgage}
        </LoadingButton>
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          isLoading={pendingKind === "loan"}
          loadingText={L.tagPending}
          disabled={busy}
          onClick={() => void tag(transaction.id, "loan")}
        >
          {L.tagLoan}
        </LoadingButton>
      </div>
    </div>
  );
}
