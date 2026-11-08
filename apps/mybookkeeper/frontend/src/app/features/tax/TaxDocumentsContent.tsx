import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import TaxDocumentsAccordion from "@/app/features/tax/TaxDocumentsAccordion";
import TaxDocumentsAccordionSkeleton from "@/app/features/tax/TaxDocumentsAccordionSkeleton";
import TaxDocumentChecklist from "@/app/features/tax/TaxDocumentChecklist";

interface TaxDocumentsContentProps {
  /** The current year filter's answer only; undefined while it loads. */
  data: SourceDocumentsResponse | undefined;
  isError: boolean;
  selectedYear: number | undefined;
  onViewDocument: (documentId: string) => void;
}

export default function TaxDocumentsContent({ data, isError, selectedYear, onViewDocument }: TaxDocumentsContentProps) {
  if (isError) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <p>I had trouble loading your tax documents. Please try refreshing.</p>
      </div>
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
