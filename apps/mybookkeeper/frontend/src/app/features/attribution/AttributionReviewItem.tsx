import { useState } from "react";
import { CheckCircle, XCircle, HelpCircle } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { formatCurrency } from "@/shared/utils/currency";
import type { AttributionReviewItem as ReviewItemType } from "@/shared/types/attribution/attribution-review";
import {
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
} from "@/shared/store/attributionApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";

interface Props {
  item: ReviewItemType;
}

export default function AttributionReviewItem({ item }: Props) {
  const [confirmReview, { isLoading: isConfirming }] = useConfirmAttributionReviewMutation();
  const [rejectReview, { isLoading: isRejecting }] = useRejectAttributionReviewMutation();
  const [isActing, setIsActing] = useState(false);

  const handleConfirm = async () => {
    setIsActing(true);
    try {
      await confirmReview({ review_id: item.id }).unwrap();
      showSuccess("Payment attributed — nice, I'll remember that.");
    } catch {
      showError("Couldn't confirm that. Try again?");
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async () => {
    setIsActing(true);
    try {
      await rejectReview({ review_id: item.id }).unwrap();
      showSuccess("Got it — skipped.");
    } catch {
      showError("Couldn't skip that. Try again?");
    } finally {
      setIsActing(false);
    }
  };

  const txn = item.transaction;
  const proposed = item.proposed_applicant;
  const displayName = txn?.payer_name ?? txn?.vendor ?? "Unknown sender";
  const amount = txn ? formatCurrency(parseFloat(txn.amount)) : "—";
  const txnDate = txn?.transaction_date
    ? new Date(txn.transaction_date).toLocaleDateString()
    : "—";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 border rounded-lg bg-card">
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium truncate">{displayName}</span>
          <span className="text-sm text-green-600 font-semibold">{amount}</span>
          <span className="text-xs text-muted-foreground">{txnDate}</span>
        </div>
        {txn?.description && (
          <p className="text-sm text-muted-foreground truncate">{txn.description}</p>
        )}
        {item.confidence === "fuzzy" && proposed ? (
          <div className="flex items-center gap-1.5 text-sm">
            <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              Looks like <strong>{proposed.legal_name ?? "Unknown"}</strong>?
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Couldn't match this to any of your tenants.</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.confidence === "fuzzy" && proposed ? (
          <LoadingButton
            variant="primary"
            size="sm"
            isLoading={isConfirming && isActing}
            loadingText="Saving..."
            onClick={handleConfirm}
            disabled={isRejecting && isActing}
          >
            <CheckCircle className="h-4 w-4 mr-1" aria-hidden="true" />
            Yes, that's them
          </LoadingButton>
        ) : null}
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isRejecting && isActing}
          loadingText="Skipping..."
          onClick={handleReject}
          disabled={isConfirming && isActing}
        >
          <XCircle className="h-4 w-4 mr-1" aria-hidden="true" />
          Not them
        </LoadingButton>
      </div>
    </div>
  );
}
