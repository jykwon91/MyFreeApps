import { useMemo } from "react";
import { Eye, Download, FileText } from "lucide-react";
import { downloadDocument } from "@/shared/utils/downloadDocument";
import { getFormLabel, FORM_TYPE_ORDER } from "@/shared/lib/tax-config";
import Badge from "@/shared/components/ui/Badge";
import type { TaxSourceDocument } from "@/shared/types/tax/source-document";

interface ReceivedDocumentsGroupedProps {
  documents: TaxSourceDocument[];
  onViewDocument: (documentId: string) => void;
}

export default function ReceivedDocumentsGrouped({
  documents,
  onViewDocument,
}: ReceivedDocumentsGroupedProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, TaxSourceDocument[]>();
    for (const doc of documents) {
      const type = doc.document_type;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(doc);
    }
    // Sort by FORM_TYPE_ORDER
    return [...groups.entries()].sort((a, b) => {
      const ai = FORM_TYPE_ORDER.indexOf(a[0]);
      const bi = FORM_TYPE_ORDER.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [documents]);

  if (documents.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>I don't see any tax documents linked to this return yet.</p>
        <p className="text-sm mt-1">Upload documents on the Documents page and they'll appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-muted border-b">
        <span className="text-sm font-medium">Received Documents ({documents.length})</span>
      </div>
      <div className="divide-y">
        {grouped.map(([formType, docs]) => (
          <div key={formType}>
            <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
              <Badge label={getFormLabel(formType)} color="blue" />
              <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {docs.length}
              </span>
            </div>
            {docs.map((doc) => (
              <div key={doc.form_instance_id} className="border-t px-3 py-2.5 flex items-center gap-3 hover:bg-muted/20 min-h-[44px]">
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
                  onClick={() => onViewDocument(doc.document_id)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-1.5 rounded hover:bg-primary/5 min-h-[44px] min-w-[44px] justify-center shrink-0"
                  title="View source document"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
