import { useRef, useState } from "react";
import { LoadMoreFooter } from "@platform/ui";
import ListLoadError from "@/components/ListLoadError";
import DocumentListSkeleton from "@/features/documents/DocumentListSkeleton";
import DocumentRow from "@/features/documents/DocumentRow";
import DocumentKindFilterSelect from "@/features/documents/DocumentKindFilterSelect";
import DocumentListEmptyState from "@/features/documents/DocumentListEmptyState";
import { deleteWithFeedback } from "@/lib/delete-with-feedback";
import { documentsEmptyKind } from "@/lib/documentsEmptyKind";
import DocumentEditDialog from "@/features/documents/DocumentEditDialog";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import type { DocumentKindFilter } from "@myjobhunter/api-client/types/document/document-kind-filter";
import { documentsFilter } from "@myjobhunter/api-client/utils/documentsFilter";
import { useDocumentsPages } from "@myjobhunter/api-client/hooks/useDocumentsPages";
import { useDeleteDocumentMutation } from "@myjobhunter/api-client/store/documentsApi";
import { DOCUMENTS_LIST_MESSAGES as MESSAGES } from "@/constants/documents-list-messages";

export interface DocumentListProps {
  /** When set, only shows documents for this application. */
  applicationId?: string;
  /** When true, the kind filter dropdown is hidden and the list is never filtered by kind. */
  hideKindFilter?: boolean;
}

export default function DocumentList({ applicationId, hideKindFilter }: DocumentListProps) {
  const [kindFilter, setKindFilter] = useState<DocumentKindFilter>("all");
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const filterRef = useRef<HTMLSelectElement>(null);
  const [deleteDocument] = useDeleteDocumentMutation();

  const list = useDocumentsPages(documentsFilter(kindFilter, applicationId));
  const { documents } = list;

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await deleteWithFeedback(() => deleteDocument(doc.id).unwrap(), "Document deleted", "Couldn't delete");
  }

  if (list.isLoading) return <DocumentListSkeleton withFilterBar={!hideKindFilter} />;

  function clearFilter() {
    setKindFilter("all");
    filterRef.current?.focus();
  }

  const emptyKind = documentsEmptyKind(list.total, documents.length, kindFilter);

  return (
    <div className="space-y-3">
      {!hideKindFilter ? (
        <DocumentKindFilterSelect value={kindFilter} onChange={setKindFilter} selectRef={filterRef} />
      ) : null}

      {list.loadError !== undefined ? (
        <ListLoadError message={MESSAGES.couldntLoad} retryLabel={MESSAGES.retry} onRetry={list.refetch} />
      ) : list.isFiltering ? (
        <DocumentListSkeleton />
      ) : emptyKind !== "none" ? (
        <DocumentListEmptyState
          kind={emptyKind}
          forApplication={applicationId !== undefined}
          onClearFilter={clearFilter}
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

      {list.isFiltering || list.loadError !== undefined ? null : (
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
