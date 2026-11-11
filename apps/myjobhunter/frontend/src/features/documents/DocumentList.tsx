import { useState } from "react";
import { EmptyState, LoadMoreFooter, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import DocumentListSkeleton from "@/features/documents/DocumentListSkeleton";
import DocumentRow from "@/features/documents/DocumentRow";
import DocumentEditDialog from "@/features/documents/DocumentEditDialog";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import type { DocumentKindFilter } from "@myjobhunter/api-client/types/document/document-kind-filter";
import { DOCUMENT_KIND_FILTER_OPTIONS } from "@myjobhunter/api-client/constants/documentKindFilterOptions";
import { documentsFilter } from "@myjobhunter/api-client/utils/documentsFilter";
import { useDocumentsPages } from "@myjobhunter/api-client/hooks/useDocumentsPages";
import { useDeleteDocumentMutation } from "@myjobhunter/api-client/store/documentsApi";
import { DOCUMENTS_LIST_MESSAGES as MESSAGES } from "@/constants/documents-list-messages";

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

  const list = useDocumentsPages(documentsFilter(kindFilter, applicationId));
  const { documents } = list;

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id).unwrap();
      showSuccess("Document deleted");
    } catch (err) {
      showError(`Couldn't delete: ${extractErrorMessage(err)}`);
    }
  }

  if (list.isLoading) return <DocumentListSkeleton />;

  if (list.loadError !== undefined) {
    return <p className="text-sm text-destructive">{MESSAGES.couldntLoad}</p>;
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

      {list.isFiltering ? (
        <DocumentListSkeleton />
      ) : documents.length === 0 ? (
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

      {list.isFiltering ? null : (
        <LoadMoreFooter
          shown={documents.length}
          total={list.total}
          hasNextPage={list.hasNextPage}
          isLoading={list.isFetchingNextPage}
          isError={list.isLoadMoreError}
          onLoadMore={list.loadMore}
          messages={MESSAGES}
        />
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
