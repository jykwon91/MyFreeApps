import { useState, useCallback } from "react";
import { useGetSourceDocumentsQuery } from "@mybookkeeper/api-client/store/taxReturnsApi";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import SourceDocumentsSkeleton from "@/app/features/tax/SourceDocumentsSkeleton";
import ReceivedDocumentsGrouped from "@/app/features/tax/ReceivedDocumentsGrouped";
import CompletenessChecklist from "@/app/features/tax/CompletenessChecklist";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export interface SourceDocumentsSectionProps {
  taxReturnId: string;
}

export default function SourceDocumentsSection({ taxReturnId }: SourceDocumentsSectionProps) {
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const { data, error, isFetching, refetch } = useGetSourceDocumentsQuery(taxReturnId);

  const handleViewDocument = useCallback((documentId: string) => {
    setViewingDocId(documentId);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewingDocId(null);
  }, []);

  // Decided on `error`, not `isError`: RTK clears `isError` while Retry
  // refetches, which would swap the alert for the skeleton mid-retry.
  if (!data) {
    if (error === undefined) return <SourceDocumentsSkeleton />;
    return (
      <LoadErrorAlert
        message="I had trouble loading the source documents."
        isRetrying={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ReceivedDocumentsGrouped
        documents={data.documents}
        onViewDocument={handleViewDocument}
      />
      <CompletenessChecklist items={data.checklist} />

      {viewingDocId ? (
        <DocumentViewer documentId={viewingDocId} onClose={handleCloseViewer} />
      ) : null}
    </div>
  );
}
