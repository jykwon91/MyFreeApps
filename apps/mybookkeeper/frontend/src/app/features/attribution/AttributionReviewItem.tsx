import { useState } from "react";
import { CheckCircle, XCircle, HelpCircle, UserCheck } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { formatCurrency } from "@/shared/utils/currency";
import type { AttributionReviewItem as ReviewItemType } from "@/shared/types/attribution/attribution-review";
import {
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
  useAttributeTransactionManuallyMutation,
} from "@/shared/store/attributionApi";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";

export interface AttributionReviewItemProps {
  item: ReviewItemType;
}

export default function AttributionReviewItem({ item }: AttributionReviewItemProps) {
  const [confirmReview, { isLoading: isConfirming }] = useConfirmAttributionReviewMutation();
  const [rejectReview, { isLoading: isRejecting }] = useRejectAttributionReviewMutation();
  const [attributeManually, { isLoading: isAttributing }] = useAttributeTransactionManuallyMutation();
  const [isActing, setIsActing] = useState(false);
  const [pickedApplicantId, setPickedApplicantId] = useState<string>("");

  const isUnmatched = item.confidence === "unmatched";

  // Only fetch the applicants list for unmatched items — otherwise this
  // mounts on every fuzzy row in the queue and burns RTK cache pressure.
  const { data: applicantsResponse, isLoading: loadingApplicants } = useGetApplicantsQuery(
    { stage: "lease_signed", limit: 200 },
    { skip: !isUnmatched },
  );
  const applicants = applicantsResponse?.items ?? [];

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

  const handleLink = async () => {
    if (!pickedApplicantId || !item.transaction) return;
    setIsActing(true);
    try {
      // Service also resolves the review-queue row, so no separate reject
      // call is needed.
      await attributeManually({
        transaction_id: item.transaction.id,
        applicant_id: pickedApplicantId,
      }).unwrap();
      showSuccess("Payment linked to tenant.");
    } catch {
      showError("Couldn't link that payment. Try again?");
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

  const anyLoading = (isConfirming || isRejecting || isAttributing) && isActing;
  const showInlinePicker = isUnmatched && txn != null;

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
        {showInlinePicker && !loadingApplicants && applicants.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <select
              value={pickedApplicantId}
              onChange={(e) => setPickedApplicantId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px]"
              aria-label="Pick a tenant for this payment"
              disabled={anyLoading}
            >
              <option value="">— pick a tenant —</option>
              {applicants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.legal_name ?? "Unnamed"}
                </option>
              ))}
            </select>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={isAttributing && isActing}
              loadingText="Linking..."
              onClick={handleLink}
              disabled={!pickedApplicantId || anyLoading}
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Link
            </LoadingButton>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.confidence === "fuzzy" && proposed ? (
          <LoadingButton
            variant="primary"
            size="sm"
            isLoading={isConfirming && isActing}
            loadingText="Saving..."
            onClick={handleConfirm}
            disabled={(isRejecting || isAttributing) && isActing}
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
          disabled={(isConfirming || isAttributing) && isActing}
        >
          <XCircle className="h-4 w-4 mr-1" aria-hidden="true" />
          Not them
        </LoadingButton>
      </div>
    </div>
  );
}
