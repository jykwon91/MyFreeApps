import { FileText, Loader2, X } from "lucide-react";
import type { UtilityPlanDocumentSource } from "@/shared/types/utility/utility-plan-document-source";

export interface UtilityPlanChosenDocumentProps {
  source: UtilityPlanDocumentSource;
  onClear: () => void;
  isReading?: boolean;
}

function nameOf(source: UtilityPlanDocumentSource): string {
  return source.kind === "file" ? source.file.name : source.name;
}

/**
 * What is being read, and a way to change your mind about it.
 *
 * Reading starts as soon as something is picked, so this doubles as the
 * progress surface — swapping the file out mid-read would race the response
 * it is about to fill the form with, which is why the clear button goes away
 * until the read settles.
 */
export default function UtilityPlanChosenDocument({
  source,
  onClear,
  isReading = false,
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
      {isReading ? (
        <span
          className="shrink-0 flex items-center gap-2 text-muted-foreground"
          data-testid="utility-plan-reading-indicator"
        >
          <Loader2 size={16} className="animate-spin" />
          Reading...
        </span>
      ) : (
        <button
          type="button"
          onClick={onClear}
          aria-label="Choose a different document"
          className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
          data-testid="utility-plan-clear-document-button"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
