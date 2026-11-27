import { showError, showSuccess } from "@platform/ui";
import { LOAN_PAYEE_LABELS as L } from "@mybookkeeper/api-client/constants/loanPayeeLabels";
import { useTagLoanPayeeMutation, useUntagLoanPayeeMutation } from "@mybookkeeper/api-client/store/loanPayeeApi";
import type { LoanPayeeKind } from "@mybookkeeper/api-client/types/loan-payee/loan-payee-kind";

export interface LoanPayeeActions {
  /** Tags the payee, toasts it with an Undo; true once tagged. */
  tag: (transactionId: string, kind: LoanPayeeKind) => Promise<boolean>;
  untag: (transactionId: string) => Promise<boolean>;
  /** The kind being saved, so only the clicked button spins. */
  pendingKind: LoanPayeeKind | null;
  isUntagging: boolean;
}

export function useLoanPayeeActions(): LoanPayeeActions {
  const [tagMutation, { isLoading: isTagging, originalArgs }] = useTagLoanPayeeMutation();
  const [untagMutation, { isLoading: isUntagging }] = useUntagLoanPayeeMutation();

  async function untag(transactionId: string): Promise<boolean> {
    try {
      const result = await untagMutation(transactionId).unwrap();
      showSuccess(L.untaggedToast(result.payee));
      return true;
    } catch {
      showError(L.untagFailed);
      return false;
    }
  }

  async function tag(transactionId: string, kind: LoanPayeeKind): Promise<boolean> {
    try {
      const result = await tagMutation({ transactionId, kind }).unwrap();
      showSuccess(L.taggedToast(result.payee), {
        label: "Undo",
        pendingLabel: L.untagPending,
        altText: `Open the transaction and choose "${L.untag}"`,
        onClick: async () => {
          await untag(transactionId);
        },
      });
      return true;
    } catch {
      showError(L.tagFailed);
      return false;
    }
  }

  return { tag, untag, pendingKind: isTagging ? (originalArgs?.kind ?? null) : null, isUntagging };
}
