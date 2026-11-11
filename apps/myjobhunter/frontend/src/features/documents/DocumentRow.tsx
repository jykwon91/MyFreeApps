import { Link } from "react-router-dom";
import { Edit2, ExternalLink, Trash2 } from "lucide-react";
import { Badge, formatFileSize } from "@platform/ui";
import { formatShortDate } from "@myjobhunter/api-client/utils/formatShortDate";
import DocumentKindBadge from "@/features/documents/DocumentKindBadge";
import DocumentDownloadButton from "@/features/documents/DocumentDownloadButton";
import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentRowProps {
  doc: Document;
  onEdit: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}

export default function DocumentRow({ doc, onEdit, onDelete }: DocumentRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <DocumentKindBadge kind={doc.kind} />
          {doc.filename ? (
            <Badge label="File" color="gray" />
          ) : null}
        </div>
        <p className="text-sm font-medium truncate">{doc.title}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>{formatShortDate(doc.updated_at)}</span>
          {doc.size_bytes ? <span>{formatFileSize(doc.size_bytes)}</span> : null}
          {doc.application_id ? (
            <Link
              to={`/applications/${doc.application_id}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
              Application
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {doc.has_file ? <DocumentDownloadButton documentId={doc.id} /> : null}
        <button
          onClick={() => onEdit(doc)}
          title="Edit"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(doc)}
          title="Delete"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
