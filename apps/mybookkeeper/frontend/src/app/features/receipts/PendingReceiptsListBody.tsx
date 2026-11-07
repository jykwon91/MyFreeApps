import EmptyState from "@/shared/components/ui/EmptyState";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import PendingReceiptRow from "./PendingReceiptRow";

export interface PendingReceiptsListBodyProps {
  mode: ListLoadMode;
  receipts: PendingReceipt[];
  canSend: boolean;
}

export default function PendingReceiptsListBody({ mode, receipts, canSend }: PendingReceiptsListBodyProps) {
  switch (mode) {
    case "loading":
      // The page shows its full-page skeleton instead.
      return null;
    case "error":
      // The page's LoadErrorAlert says the receipts couldn't load.
      return null;
    case "empty":
      return (
        <EmptyState message="When you attribute a rent payment to a tenant, I'll queue a receipt here for you to review and send." />
      );
    case "list":
      return (
        <div className="bg-card border rounded-lg p-4 divide-y">
          {receipts.map((receipt) => (
            <PendingReceiptRow key={receipt.id} receipt={receipt} canSend={canSend} />
          ))}
        </div>
      );
  }
}
