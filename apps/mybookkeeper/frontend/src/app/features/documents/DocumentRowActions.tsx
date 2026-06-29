import { FileCheck, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@platform/ui";
import type { Document } from "@/shared/types/document/document";

interface DocumentRowActionsProps {
  doc: Document;
  onDelete: (id: string) => void;
  onToggleEscrow?: (id: string, currentValue: boolean) => void;
  onReExtract?: (id: string) => void;
  reExtractingId?: string | null;
  canWrite?: boolean;
  /** Larger touch targets for the mobile card view (>=44px). */
  comfortable?: boolean;
}

/**
 * Per-row document actions (re-extract failed docs, toggle reference-only,
 * delete). Shared by the desktop table's actions column and the mobile card so
 * both surfaces stay in parity — see DocumentTable.
 */
export default function DocumentRowActions({
  doc,
  onDelete,
  onToggleEscrow,
  onReExtract,
  reExtractingId,
  canWrite = true,
  comfortable = false,
}: DocumentRowActionsProps) {
  if (!canWrite) return null;

  const sizeClass = comfortable ? "h-11 w-11 flex items-center justify-center" : "p-1.5";
  const iconSize = comfortable ? 18 : 14;
  const isReExtracting = reExtractingId === doc.id;

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {onReExtract && doc.status === "failed" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onReExtract(doc.id)}
          disabled={isReExtracting}
          title="Re-extract this document"
          aria-label="Re-extract this document"
          className={`${sizeClass} text-muted-foreground hover:text-primary`}
        >
          <RotateCw size={iconSize} className={isReExtracting ? "animate-spin" : ""} />
        </Button>
      )}
      {onToggleEscrow && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleEscrow(doc.id, doc.is_escrow_paid)}
          title={doc.is_escrow_paid ? "Unmark as reference-only" : "Mark as reference-only (escrow-paid)"}
          aria-label={doc.is_escrow_paid ? "Unmark as reference-only" : "Mark as reference-only"}
          className={`${sizeClass} ${doc.is_escrow_paid ? "text-blue-600" : "text-muted-foreground hover:text-blue-600"}`}
        >
          <FileCheck size={iconSize} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(doc.id)}
        title="Delete"
        aria-label="Delete document"
        className={`${sizeClass} text-destructive hover:text-destructive`}
      >
        <Trash2 size={iconSize} />
      </Button>
    </div>
  );
}
