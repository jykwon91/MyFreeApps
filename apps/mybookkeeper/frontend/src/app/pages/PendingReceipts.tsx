import { Link } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import { useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { RECEIPT_GMAIL_STATE_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import PendingReceiptRow from "@/app/features/receipts/PendingReceiptRow";
import PendingReceiptsSkeleton from "@/app/features/receipts/PendingReceiptsSkeleton";

export default function PendingReceipts() {
  const { data, isLoading, isError, refetch } = useGetPendingReceiptsQuery();
  const receipts = data?.items ?? [];
  const pendingCount = data?.pending_count ?? 0;
  const gmailState = data?.gmail_state ?? "ready";

  if (isLoading) {
    return <PendingReceiptsSkeleton />;
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Pending Receipts"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} receipt${pendingCount === 1 ? "" : "s"} waiting to send`
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

      {gmailState !== "ready" && (
        <AlertBox variant="warning">
          <span data-testid="pending-receipts-gmail-state">
            {RECEIPT_GMAIL_STATE_MESSAGES[gmailState]}{" "}
          </span>
          <Link to="/integrations" className="underline hover:no-underline">
            Open Integrations
          </Link>
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
            <PendingReceiptRow key={receipt.id} receipt={receipt} canSend={gmailState === "ready"} />
          ))}
        </div>
      )}
    </main>
  );
}
