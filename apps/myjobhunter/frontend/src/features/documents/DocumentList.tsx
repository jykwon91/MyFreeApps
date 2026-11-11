import { useState } from "react";
import { EmptyState, Skeleton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import DocumentRow from "@/features/documents/DocumentRow";
import DocumentEditDialog from "@/features/documents/DocumentEditDialog";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import type { DocumentKindFilter } from "@myjobhunter/api-client/types/document/document-kind-filter";
import { DOCUMENT_KIND_FILTER_OPTIONS } from "@myjobhunter/api-client/constants/documentKindFilterOptions";
import { documentsFilter } from "@myjobhunter/api-client/utils/documentsFilter";
import {
  useListDocumentsQuery,
  useDeleteDocumentMutation,
} from "@myjobhunter/api-client/store/documentsApi";

export interface DocumentListProps {
  /** When set, only shows documents for this application. */
  applicationId?: string;
  /** When true, the kind filter dropdown is hidden (parent controls it). */
  hideKindFilter?: boolean;
}

export default function DocumentList({ applicationId, hideKindFilter }: DocumentListProps) {
  const [kindFilter, setKindFilter] = useState<DocumentKindFilter>("all");
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deleteDocument] = useDeleteDocumentMutation();

  const { data, isLoading, isError } = useListDocumentsQuery(documentsFilter(kindFilter, applicationId));

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
            onChange={(e) => setKindFilter(e.target.value as DocumentKindFilter)}
            className="text-sm border rounded-md px-2 py-1 bg-background"
          >
            {DOCUMENT_KIND_FILTER_OPTIONS.map(({ value, label }) => (
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
          key={editingDoc.id}
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
