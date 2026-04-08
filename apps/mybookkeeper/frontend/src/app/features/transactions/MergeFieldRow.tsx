import { AlertTriangle } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { FIELD_LABELS, type MergeableField } from "@/app/features/transactions/merge-defaults";
import type { MergeFieldSide } from "@/shared/types/transaction/duplicate";

interface MergeFieldRowProps {
  field: MergeableField;
  labelA: string;
  labelB: string;
  valueA: string | null;
  valueB: string | null;
  selected: MergeFieldSide;
  onSelect: (side: MergeFieldSide) => void;
  showAmountWarning?: boolean;
}

export default function MergeFieldRow({
  field,
  labelA,
  labelB,
  valueA,
  valueB,
  selected,
  onSelect,
  showAmountWarning,
}: MergeFieldRowProps) {
  return (
    <div className="grid grid-cols-[6rem_1fr_1fr] sm:grid-cols-[8rem_1fr_1fr] gap-2 items-center py-2 border-b last:border-b-0">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
        {FIELD_LABELS[field]}
        {showAmountWarning && (
          <AlertTriangle size={12} className="inline ml-1 text-amber-500" />
        )}
      </span>

      {/* Side A */}
      <button
        type="button"
        onClick={() => onSelect("a")}
        className={cn(
          "text-left text-sm rounded px-2 py-1.5 border-l-2 transition-all min-h-[44px] sm:min-h-0 break-words",
          selected === "a"
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-foreground"
            : "border-transparent opacity-50 hover:opacity-75",
        )}
      >
        <span className="block text-[10px] font-medium text-muted-foreground mb-0.5 uppercase">
          {labelA}
        </span>
        <span>{valueA ?? "—"}</span>
      </button>

      {/* Side B */}
      <button
        type="button"
        onClick={() => onSelect("b")}
        className={cn(
          "text-left text-sm rounded px-2 py-1.5 border-l-2 transition-all min-h-[44px] sm:min-h-0 break-words",
          selected === "b"
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-foreground"
            : "border-transparent opacity-50 hover:opacity-75",
        )}
      >
        <span className="block text-[10px] font-medium text-muted-foreground mb-0.5 uppercase">
          {labelB}
        </span>
        <span>{valueB ?? "—"}</span>
      </button>
    </div>
  );
}
