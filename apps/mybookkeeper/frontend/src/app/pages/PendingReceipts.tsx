import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import { pagedListView } from "@/shared/lib/paged-list-view";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { usePendingReceiptsPages } from "@mybookkeeper/api-client/hooks/usePendingReceiptsPages";
import { receiptsWaitingLine } from "@mybookkeeper/api-client/utils/receiptsWaitingLine";
import { RECEIPT_GMAIL_STATE_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import PendingReceiptsListBody from "@/app/features/receipts/PendingReceiptsListBody";
import PendingReceiptsSkeleton from "@/app/features/receipts/PendingReceiptsSkeleton";

export default function PendingReceipts() {
  const pages = usePendingReceiptsPages();
  const { mode, rows } = pagedListView(pages, pages.receipts);
  const { gmailState } = pages;

  if (mode === "loading") {
    return <PendingReceiptsSkeleton />;
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Pending Receipts"
        subtitle={
          pages.total > 0
            ? receiptsWaitingLine(pages.total)
            : "Rent receipts that have been auto-queued from attributed payments."
        }
      />

      <ListPagesErrorAlert pages={pages} noun="pending receipts" />

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

      <PendingReceiptsListBody mode={mode} receipts={rows} canSend={gmailState === "ready"} />

      {mode === "list" ? (
        <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
      ) : null}
    </div>
  );
}
