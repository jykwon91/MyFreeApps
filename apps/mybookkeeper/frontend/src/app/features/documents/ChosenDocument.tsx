import { FileText, Loader2, X } from "lucide-react";
import type { DocumentSource } from "@/shared/types/document/document-source";

export interface ChosenDocumentProps {
  source: DocumentSource;
  onClear: () => void;
  /** Namespaces the test ids so each domain's specs address their own card. */
  testIdPrefix: string;
  isReading?: boolean;
}

function nameOf(source: DocumentSource): string {
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
export default function ChosenDocument({
  source,
  onClear,
  testIdPrefix,
  isReading = false,
}: ChosenDocumentProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 min-h-[44px] rounded-md border px-3 py-2 text-sm"
      role="status"
      data-testid={`${testIdPrefix}-chosen-document`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <FileText size={16} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{nameOf(source)}</span>
      </span>
      {isReading ? (
        <span
          className="shrink-0 flex items-center gap-2 text-muted-foreground"
          data-testid={`${testIdPrefix}-reading-indicator`}
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
          data-testid={`${testIdPrefix}-clear-document-button`}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
