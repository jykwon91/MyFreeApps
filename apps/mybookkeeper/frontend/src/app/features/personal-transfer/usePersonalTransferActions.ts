import { showError, showSuccess } from "@platform/ui";
import { PERSONAL_TRANSFER_LABELS as L } from "@mybookkeeper/api-client/constants/personalTransferLabels";
import {
  useMarkPersonalTransferMutation,
  useUnmarkPersonalTransferMutation,
} from "@mybookkeeper/api-client/store/personalTransferApi";
import {
  personalTransferMarkedMessage,
  personalTransferUnmarkedMessage,
} from "@mybookkeeper/api-client/utils/personalTransferMessages";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";

export interface PersonalTransferActions {
  /** Marks it, toasts what happened with an Undo; true once marked. */
  mark: (transactionId: string) => Promise<boolean>;
  unmark: (transactionId: string, forgetSender: boolean) => Promise<boolean>;
  isMarking: boolean;
  isUnmarking: boolean;
}

/** `onStatusChange` hears the transaction's new status after a mark, an un-mark or an Undo. */
export function usePersonalTransferActions(
  onStatusChange?: (status: TransactionStatus) => void,
): PersonalTransferActions {
  const [markMutation, { isLoading: isMarking }] = useMarkPersonalTransferMutation();
  const [unmarkMutation, { isLoading: isUnmarking }] = useUnmarkPersonalTransferMutation();

  async function unmark(transactionId: string, forgetSender: boolean): Promise<boolean> {
    try {
      const result = await unmarkMutation({ transaction_id: transactionId, forget_sender: forgetSender }).unwrap();
      showSuccess(personalTransferUnmarkedMessage(result));
      onStatusChange?.(result.status);
      return true;
    } catch {
      showError(L.unmarkFailed);
      return false;
    }
  }

  async function mark(transactionId: string): Promise<boolean> {
    try {
      const result = await markMutation(transactionId).unwrap();
      onStatusChange?.("personal_transfer");
      showSuccess(personalTransferMarkedMessage(result), {
        label: "Undo",
        pendingLabel: L.unmarkPending,
        altText: `Open the transaction and choose "${L.unmark}"`,
        // Undo takes back the whole click, the remembered sender included.
        onClick: async () => {
          await unmark(transactionId, true);
        },
      });
      return true;
    } catch {
      showError(L.markFailed);
      return false;
    }
  }

  return { mark, unmark, isMarking, isUnmarking };
}
