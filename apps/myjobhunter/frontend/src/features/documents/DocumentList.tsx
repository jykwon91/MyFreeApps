import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Edit2, ExternalLink, Trash2 } from "lucide-react";
import { Badge, EmptyState, Skeleton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import DocumentKindBadge from "@/features/documents/DocumentKindBadge";
import DocumentEditDialog from "@/features/documents/DocumentEditDialog";
import type { Document } from "@/types/document/document";
import type { DocumentKind } from "@/types/document/document-kind";
import { DOCUMENT_KIND_OPTIONS } from "@/features/documents/document-kind-labels";
import {
  useListDocumentsQuery,
  useDeleteDocumentMutation,
  useGetDocumentDownloadUrlQuery,
} from "@/lib/documentsApi";

export interface DocumentListProps {
  /** When set, only shows documents for this application. */
  applicationId?: string;
  /** When true, the kind filter dropdown is hidden (parent controls it). */
  hideKindFilter?: boolean;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface DownloadButtonProps {
  documentId: string;
}

function DownloadButton({ documentId }: DownloadButtonProps) {
  const [fetch, setFetch] = useState(false);
  const { data, isFetching } = useGetDocumentDownloadUrlQuery(documentId, {
    skip: !fetch,
  });

  function handleClick() {
    if (data?.url) {
      window.open(data.url, "_blank", "noopener,noreferrer");
      setFetch(false);
    } else {
      setFetch(true);
    }
  }

  if (data?.url && fetch) {
    window.open(data.url, "_blank", "noopener,noreferrer");
    setFetch(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={isFetching}
      title="Download file"
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      <Download size={14} />
    </button>
  );
}

interface DocumentRowProps {
  doc: Document;
  onEdit: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}

function DocumentRow({ doc, onEdit, onDelete }: DocumentRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <DocumentKindBadge kind={doc.kind as DocumentKind} />
          {doc.filename ? (
            <Badge label="File" color="gray" />
          ) : null}
        </div>
        <p className="text-sm font-medium truncate">{doc.title}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>{formatDate(doc.updated_at)}</span>
          {doc.size_bytes ? <span>{formatBytes(doc.size_bytes)}</span> : null}
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
        {doc.has_file ? <DownloadButton documentId={doc.id} /> : null}
        <button
          onClick={() => onEdit(doc)}
          title="Edit"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(doc)}
          title="Delete"
          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function DocumentList({ applicationId, hideKindFilter }: DocumentListProps) {
  const [kindFilter, setKindFilter] = useState<string>("");
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deleteDocument] = useDeleteDocumentMutation();

  const { data, isLoading, isError } = useListDocumentsQuery({
    application_id: applicationId,
    kind: kindFilter || undefined,
  });

  const documents = data?.items ?? [];

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id).unwrap();
      showSuccess("Document deleted");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load documents. Please refresh.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!hideKindFilter ? (
        <div className="flex items-center gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="text-sm border rounded-md px-2 py-1 bg-background"
          >
            <option value="">All types</option>
            {DOCUMENT_KIND_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          icon="FileText"
          heading="No documents yet"
          body={
            applicationId
              ? "Upload a cover letter or tailored resume for this application."
              : "Start by uploading a document or writing a cover letter draft."
          }
        />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onEdit={setEditingDoc}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {editingDoc ? (
        <DocumentEditDialog
          document={editingDoc}
          open
          onOpenChange={(open) => {
            if (!open) setEditingDoc(null);
          }}
        />
      ) : null}
    </div>
  );
}
