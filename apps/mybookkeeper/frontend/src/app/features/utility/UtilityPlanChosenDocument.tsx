import { FileText, X } from "lucide-react";
import type { UtilityPlanDocumentSource } from "@/shared/types/utility/utility-plan-document-source";

export interface UtilityPlanChosenDocumentProps {
  source: UtilityPlanDocumentSource;
  onClear: () => void;
  disabled?: boolean;
}

function nameOf(source: UtilityPlanDocumentSource): string {
  return source.kind === "file" ? source.file.name : source.name;
}

/** What is about to be read, and a way to change your mind about it. */
export default function UtilityPlanChosenDocument({
  source,
  onClear,
  disabled = false,
}: UtilityPlanChosenDocumentProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 min-h-[44px] rounded-md border px-3 py-2 text-sm"
      role="status"
      data-testid="utility-plan-chosen-document"
    >
      <span className="flex items-center gap-2 min-w-0">
        <FileText size={16} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{nameOf(source)}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        aria-label="Choose a different document"
        className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
        data-testid="utility-plan-clear-document-button"
      >
        <X size={16} />
      </button>
    </div>
  );
}
