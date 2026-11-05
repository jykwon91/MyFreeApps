import { useState } from "react";
import { Button } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { formatCurrency } from "@/shared/utils/currency";
import { useDismissReceiptMutation } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { RECEIPT_SEND_BLOCKER_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { receiptPayerName } from "@mybookkeeper/api-client/utils/receiptPayerName";
import SendReceiptDialog from "./SendReceiptDialog";

export interface PendingReceiptRowProps {
  receipt: PendingReceipt;
  /** False while Gmail can't send; the page explains why. */
  canSend: boolean;
}

export default function PendingReceiptRow({ receipt, canSend }: PendingReceiptRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissReceipt, { isLoading: isDismissing }] = useDismissReceiptMutation();

  async function handleDismiss() {
    try {
      await dismissReceipt({ transaction_id: receipt.transaction_id }).unwrap();
      showSuccess("Receipt dismissed.");
    } catch {
      showError("Couldn't dismiss the receipt. Please try again.");
    }
  }

  // A send whose outcome Gmail never confirmed. It can't be dismissed; the
  // next send checks Gmail before emailing again.
  const isConfirming = receipt.status === "sending";
  const blocker = receipt.send_blocker;

  return (
    <>
      <div
        data-testid="pending-receipt-row"
        className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{receiptPayerName(receipt) ?? "Tenant"}</p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(receipt.amount)} &middot; {receipt.period_start_date} – {receipt.period_end_date}
          </p>
          <p className="text-xs text-muted-foreground">Received {receipt.transaction_date}</p>
          {blocker && (
            <p data-testid="pending-receipt-blocker" className="text-xs text-amber-700 mt-1">
              {RECEIPT_SEND_BLOCKER_MESSAGES[blocker]}
            </p>
          )}
          {isConfirming && (
            <span
              data-testid="pending-receipt-confirming"
              className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
            >
              Confirming with Gmail
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isConfirming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="pending-receipt-dismiss-btn"
              onClick={() => void handleDismiss()}
              disabled={isDismissing}
            >
              Dismiss
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="pending-receipt-send-btn"
            onClick={() => setDialogOpen(true)}
            disabled={!canSend || blocker !== null}
          >
            Review &amp; send
          </Button>
        </div>
      </div>

      {dialogOpen && (
        <SendReceiptDialog receipt={receipt} onClose={() => setDialogOpen(false)} />
      )}
    </>
  );
}
