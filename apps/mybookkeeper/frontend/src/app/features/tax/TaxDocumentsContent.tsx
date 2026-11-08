import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import TaxDocumentsAccordion from "@/app/features/tax/TaxDocumentsAccordion";
import TaxDocumentsAccordionSkeleton from "@/app/features/tax/TaxDocumentsAccordionSkeleton";
import TaxDocumentChecklist from "@/app/features/tax/TaxDocumentChecklist";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

interface TaxDocumentsContentProps {
  /** The current year filter's answer only; undefined while it loads. */
  data: SourceDocumentsResponse | undefined;
  hasError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  selectedYear: number | undefined;
  onViewDocument: (documentId: string) => void;
}

export default function TaxDocumentsContent({
  data,
  hasError,
  isRetrying,
  onRetry,
  selectedYear,
  onViewDocument,
}: TaxDocumentsContentProps) {
  if (hasError && !data) {
    return (
      <LoadErrorAlert
        message="I had trouble loading your tax documents."
        isRetrying={isRetrying}
        onRetry={onRetry}
      />
    );
  }

  if (!data) return <TaxDocumentsAccordionSkeleton />;

  return (
    <div className="space-y-4 md:flex-1 md:overflow-auto md:min-h-0">
      {/* A fresh list per filter, so the chosen year opens with its forms showing. */}
      <TaxDocumentsAccordion
        key={selectedYear ?? "all"}
        documents={data.documents}
        onViewDocument={onViewDocument}
      />
      <TaxDocumentChecklist items={data.checklist} />
    </div>
  );
}
