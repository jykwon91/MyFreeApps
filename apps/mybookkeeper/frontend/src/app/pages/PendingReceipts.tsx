import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { receiptsWaitingLine } from "@mybookkeeper/api-client/utils/receiptsWaitingLine";
import { RECEIPT_GMAIL_STATE_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import PendingReceiptsListBody from "@/app/features/receipts/PendingReceiptsListBody";
import PendingReceiptsSkeleton from "@/app/features/receipts/PendingReceiptsSkeleton";

export default function PendingReceipts() {
  const { data, error, isFetching, refetch } = useGetPendingReceiptsQuery();
  const receipts = data?.items ?? [];
  const pendingCount = data?.pending_count ?? 0;
  const gmailState = data?.gmail_state ?? "ready";
  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: receipts.length,
  });

  if (mode === "loading") {
    return <PendingReceiptsSkeleton />;
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Pending Receipts"
        subtitle={
          pendingCount > 0
            ? receiptsWaitingLine(pendingCount)
            : "Rent receipts that have been auto-queued from attributed payments."
        }
      />

      {error ? (
        <LoadErrorAlert message="Couldn't load pending receipts." isRetrying={isFetching} onRetry={() => void refetch()} />
      ) : null}

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

      <PendingReceiptsListBody mode={mode} receipts={receipts} canSend={gmailState === "ready"} />
    </main>
  );
}
