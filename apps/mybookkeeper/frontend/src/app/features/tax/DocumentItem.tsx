import { Eye, Download } from "lucide-react";
import { downloadDocument } from "@/shared/utils/downloadDocument";
import type { TaxSourceDocument } from "@/shared/types/tax/source-document";

interface DocumentItemProps {
  doc: TaxSourceDocument;
  onView: (documentId: string) => void;
}

export default function DocumentItem({ doc, onView }: DocumentItemProps) {
  return (
    <div className="border-t px-3 py-2.5 flex items-center gap-3 hover:bg-muted/20 min-h-[44px]">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm truncate block">
          {doc.issuer_name ?? "Unknown issuer"}
        </span>
        {doc.issuer_ein ? (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            EIN: {doc.issuer_ein}
          </span>
        ) : null}
      </div>
      <button
        onClick={() => downloadDocument(doc.document_id, doc.file_name)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium px-2 py-1.5 rounded hover:bg-muted min-h-[44px] min-w-[44px] justify-center shrink-0"
        title="Download document"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onView(doc.document_id)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-1.5 rounded hover:bg-primary/5 min-h-[44px] min-w-[44px] justify-center shrink-0"
        title="View source document"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
    </div>
  );
}
