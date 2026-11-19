import { CheckCircle, Hammer, Loader2, Trash2 } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import {
  MARK_CAPITAL_IMPROVEMENT,
  MARKING_CAPITAL_IMPROVEMENT,
  UNMARK_CAPITAL_IMPROVEMENT,
  UNMARKING_CAPITAL_IMPROVEMENT,
} from "@mybookkeeper/api-client/constants/capitalImprovementLabels";
import { CHECKING_SELECTION_LABEL, RANGE_SELECT_HINT } from "@/shared/lib/transaction-list-messages";

export interface TransactionBulkBarProps {
  selectedCount: number;
  hasApprovable: boolean;
  isApproving: boolean;
  isDeleting: boolean;
  isMarkingCapital: boolean;
  isUnmarkingCapital: boolean;
  /** The ticks are being checked against new filters: the count isn't final, so nothing can run yet. */
  isCheckingSelection: boolean;
  onApprove: () => void;
  onMarkCapital: () => void;
  onUnmarkCapital: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export default function TransactionBulkBar({ selectedCount, hasApprovable, isApproving, isDeleting, isMarkingCapital, isUnmarkingCapital, isCheckingSelection, onApprove, onMarkCapital, onUnmarkCapital, onDelete, onClearSelection }: TransactionBulkBarProps) {
  const busy = isApproving || isDeleting || isMarkingCapital || isUnmarkingCapital;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
      {isCheckingSelection ? (
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          {CHECKING_SELECTION_LABEL}
        </span>
      ) : (
        <span className="font-medium">{selectedCount} selected</span>
      )}
      {hasApprovable && (
        <LoadingButton
          size="sm"
          onClick={onApprove}
          disabled={isCheckingSelection || (busy && !isApproving)}
          isLoading={isApproving}
          loadingText={`Approving ${selectedCount}...`}
        >
          <CheckCircle size={14} className="mr-1.5" />
          Approve
        </LoadingButton>
      )}
      <LoadingButton
        size="sm"
        variant="secondary"
        onClick={onMarkCapital}
        disabled={isCheckingSelection || (busy && !isMarkingCapital)}
        isLoading={isMarkingCapital}
        loadingText={MARKING_CAPITAL_IMPROVEMENT}
      >
        <Hammer size={14} className="mr-1.5" />
        {MARK_CAPITAL_IMPROVEMENT}
      </LoadingButton>
      <LoadingButton
        size="sm"
        variant="ghost"
        onClick={onUnmarkCapital}
        disabled={isCheckingSelection || (busy && !isUnmarkingCapital)}
        isLoading={isUnmarkingCapital}
        loadingText={UNMARKING_CAPITAL_IMPROVEMENT}
      >
        {UNMARK_CAPITAL_IMPROVEMENT}
      </LoadingButton>
      <LoadingButton
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={isCheckingSelection || (busy && !isDeleting)}
        isLoading={isDeleting}
        loadingText={`Deleting ${selectedCount}...`}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 size={14} className="mr-1.5" />
        Delete
      </LoadingButton>
      <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">{RANGE_SELECT_HINT}</span>
      <button
        className="ml-auto text-xs lg:ml-0 text-muted-foreground hover:text-foreground"
        onClick={onClearSelection}
        disabled={busy}
      >
        Clear selection
      </button>
    </div>
  );
}
