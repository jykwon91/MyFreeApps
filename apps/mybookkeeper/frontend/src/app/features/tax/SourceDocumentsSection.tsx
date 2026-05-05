import { useState, useCallback } from "react";
import { useGetSourceDocumentsQuery } from "@/shared/store/taxReturnsApi";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import SourceDocumentsSkeleton from "@/app/features/tax/SourceDocumentsSkeleton";
import ReceivedDocumentsGrouped from "@/app/features/tax/ReceivedDocumentsGrouped";
import CompletenessChecklist from "@/app/features/tax/CompletenessChecklist";

export interface SourceDocumentsSectionProps {
  taxReturnId: string;
}

export default function SourceDocumentsSection({ taxReturnId }: SourceDocumentsSectionProps) {
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const { data, isLoading, isError } = useGetSourceDocumentsQuery(taxReturnId);

  const handleViewDocument = useCallback((documentId: string) => {
    setViewingDocId(documentId);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewingDocId(null);
  }, []);

  if (isLoading) {
    return <SourceDocumentsSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <p>I had trouble loading the source documents. Please try refreshing.</p>
      </div>
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
