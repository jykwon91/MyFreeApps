import type { DismissalReason } from "@/store/discoverApi";

const DISMISS_REASONS: { value: DismissalReason; label: string }[] = [
  { value: "wrong_stack", label: "Wrong tech stack" },
  { value: "too_small_company", label: "Company too small" },
  { value: "wrong_sector", label: "Wrong industry / sector" },
  { value: "wrong_comp", label: "Compensation mismatch" },
  { value: "not_remote", label: "Not actually remote" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];

interface DismissReasonPopoverProps {
  onDismiss: (reason?: DismissalReason) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export default function DismissReasonPopover({
  onDismiss,
  onCancel,
  isLoading,
}: DismissReasonPopoverProps) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <p className="text-xs font-medium">Why are you dismissing this?</p>
      <div className="flex flex-wrap gap-1.5">
        {DISMISS_REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onDismiss(r.value)}
            disabled={isLoading}
            className="px-2 py-1 text-xs border rounded hover:bg-muted"
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDismiss()}
          disabled={isLoading}
          className="text-xs text-muted-foreground hover:underline"
        >
          Skip — dismiss without a reason
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:underline ml-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
