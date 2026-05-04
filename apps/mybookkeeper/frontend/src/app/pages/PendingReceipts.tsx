import { useState } from "react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useGetPendingReceiptsQuery,
  useDismissReceiptMutation,
} from "@/shared/store/rentReceiptsApi";
import { useGetTransactionQuery } from "@/shared/store/transactionsApi";
import SendReceiptDialog from "@/app/features/receipts/SendReceiptDialog";
import PendingReceiptsSkeleton from "@/app/features/receipts/PendingReceiptsSkeleton";
import type { PendingReceipt } from "@/shared/types/lease/pending-receipt";

function PendingReceiptRow({ receipt }: { receipt: PendingReceipt }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: transaction } = useGetTransactionQuery(receipt.transaction_id);
  const [dismissReceipt, { isLoading: isDismissing }] = useDismissReceiptMutation();

  async function handleDismiss() {
    try {
      await dismissReceipt({ transaction_id: receipt.transaction_id }).unwrap();
      showSuccess("Receipt dismissed.");
    } catch {
      showError("Couldn't dismiss the receipt. Please try again.");
    }
  }

  const amountDisplay = transaction
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        parseFloat(transaction.amount),
      )
    : "—";

  const periodDisplay = `${receipt.period_start_date} – ${receipt.period_end_date}`;

  return (
    <>
      <div
        data-testid="pending-receipt-row"
        className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {transaction?.payer_name ?? transaction?.vendor ?? "Tenant"}
          </p>
          <p className="text-xs text-muted-foreground">
            {amountDisplay} &middot; {periodDisplay}
          </p>
          <p className="text-xs text-muted-foreground">
            Received {transaction?.transaction_date ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="pending-receipt-send-btn"
            onClick={() => setDialogOpen(true)}
            disabled={!transaction}
          >
            Review &amp; send
          </Button>
        </div>
      </div>

      {dialogOpen && transaction && (
        <SendReceiptDialog
          transaction={transaction}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

export default function PendingReceipts() {
  const { data, isLoading, isError, refetch } = useGetPendingReceiptsQuery();
  const receipts = data?.items ?? [];
  const pendingCount = data?.pending_count ?? 0;

  if (isLoading) {
    return <PendingReceiptsSkeleton />;
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Pending Receipts"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} receipt${pendingCount === 1 ? "" : "s"} ready to send`
            : "Rent receipts that have been auto-queued from attributed payments."
        }
      />

      {isError && (
        <AlertBox variant="error">
          Couldn't load pending receipts.{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            className="underline hover:no-underline"
          >
            Tap to retry.
          </button>
        </AlertBox>
      )}

      {!isError && receipts.length === 0 && (
        <EmptyState
          message="When you attribute a rent payment to a tenant, I'll queue a receipt here for you to review and send."
        />
      )}

      {receipts.length > 0 && (
        <div className="bg-card border rounded-lg p-4 divide-y">
          {receipts.map((receipt) => (
            <PendingReceiptRow key={receipt.id} receipt={receipt} />
          ))}
        </div>
      )}
    </main>
  );
}
