import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { PERSONAL_TRANSFER_LABELS as L } from "@mybookkeeper/api-client/constants/personalTransferLabels";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { usePersonalTransferActions } from "./usePersonalTransferActions";

export interface TransactionPersonalTransferSectionProps {
  transaction: Transaction;
  /** The panel holds a snapshot of the transaction, so it's told the new status. */
  onStatusChange?: (status: TransactionStatus) => void;
}

/** On the transaction panel: mark it a personal transfer, or take that back. */
export default function TransactionPersonalTransferSection({ transaction, onStatusChange }: TransactionPersonalTransferSectionProps) {
  const canWrite = useCanWrite();
  const { mark, unmark, isMarking, isUnmarking } = usePersonalTransferActions(onStatusChange);
  const [forgetSender, setForgetSender] = useState(true);

  const isMarked = transaction.status === "personal_transfer";
  // A duplicate is already left out of every total; it gets merged or deleted, not marked.
  if (!canWrite || transaction.status === "duplicate") return null;

  if (!isMarked) {
    return (
      <div className="px-5 py-4 border-t space-y-2">
        <p className="text-xs text-muted-foreground">{L.markHelp}</p>
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isMarking}
          loadingText={L.markOnCardPending}
          onClick={() => void mark(transaction.id)}
        >
          <ArrowLeftRight className="h-4 w-4 mr-1" aria-hidden="true" />
          {L.markOnTransaction}
        </LoadingButton>
      </div>
    );
  }

  return (
    <div data-testid="personal-transfer-notice" className="px-5 py-4 border-t space-y-3">
      <p className="text-sm">{L.marked}</p>
      {transaction.payer_name && (
        <label className="flex items-center gap-2 text-sm min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={forgetSender}
            onChange={(e) => setForgetSender(e.target.checked)}
            disabled={isUnmarking}
          />
          {L.forgetSenderToggle(transaction.payer_name)}
        </label>
      )}
      <LoadingButton
        type="button"
        variant="secondary"
        size="sm"
        isLoading={isUnmarking}
        loadingText={L.unmarkPending}
        onClick={() => void unmark(transaction.id, Boolean(transaction.payer_name) && forgetSender)}
      >
        {L.unmark}
      </LoadingButton>
    </div>
  );
}
