import { CheckCircle, Trash2 } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";

export interface TransactionBulkBarProps {
  selectedCount: number;
  hasApprovable: boolean;
  isApproving: boolean;
  isDeleting: boolean;
  onApprove: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export default function TransactionBulkBar({ selectedCount, hasApprovable, isApproving, isDeleting, onApprove, onDelete, onClearSelection }: TransactionBulkBarProps) {
  const busy = isApproving || isDeleting;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
      <span className="font-medium">{selectedCount} selected</span>
      {hasApprovable && (
        <LoadingButton
          size="sm"
          onClick={onApprove}
          disabled={busy && !isApproving}
          isLoading={isApproving}
          loadingText={`Approving ${selectedCount}...`}
        >
          <CheckCircle size={14} className="mr-1.5" />
          Approve
        </LoadingButton>
      )}
      <LoadingButton
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={busy && !isDeleting}
        isLoading={isDeleting}
        loadingText={`Deleting ${selectedCount}...`}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 size={14} className="mr-1.5" />
        Delete
      </LoadingButton>
      <button
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        onClick={onClearSelection}
        disabled={busy}
      >
        Clear selection
      </button>
    </div>
  );
}
