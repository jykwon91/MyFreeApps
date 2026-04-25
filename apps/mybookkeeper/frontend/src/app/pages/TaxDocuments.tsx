import { useState, useCallback, useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { useListTaxDocumentsQuery, useListTaxReturnsQuery } from "@/shared/store/taxReturnsApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import TaxDocumentsAccordion from "@/app/features/tax/TaxDocumentsAccordion";
import TaxDocumentsAccordionSkeleton from "@/app/features/tax/TaxDocumentsAccordionSkeleton";
import TaxDocumentChecklist from "@/app/features/tax/TaxDocumentChecklist";
import { useDismissable } from "@/shared/hooks/useDismissable";

export default function TaxDocuments() {
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("tax-docs-info-dismissed");
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);

  const { data: taxReturns = [] } = useListTaxReturnsQuery();
  const { data, isLoading, isError } = useListTaxDocumentsQuery(
    selectedYear ? { tax_year: selectedYear } : undefined,
  );

  const availableYears = useMemo(() => {
    const years = [...new Set(taxReturns.map((r) => r.tax_year))].sort((a, b) => b - a);
    return years;
  }, [taxReturns]);

  const handleViewDocument = useCallback((documentId: string) => {
    setViewingDocId(documentId);
  }, []);

  return (
    <main className="p-4 sm:p-8 space-y-4 md:h-screen md:flex md:flex-col md:overflow-hidden">
      <div className="flex items-center justify-between">
        <SectionHeader title="Tax Documents" />
        {availableYears.length > 0 && (
          <div className="relative">
            <select
              value={selectedYear ?? ""}
              onChange={(e) =>
                setSelectedYear(e.target.value ? Number(e.target.value) : undefined)
              }
              className="appearance-none border rounded-md px-3 py-2 pr-8 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Years</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            I track which tax documents you&rsquo;re expected to receive based on your properties and past filings &mdash; W-2s from employers, 1099s from rental platforms, 1098s from your mortgage lender. Upload them as they arrive and I&rsquo;ll keep this checklist up to date.
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      {isLoading ? (
        <TaxDocumentsAccordionSkeleton />
      ) : isError ? (
        <div className="border rounded-lg p-6 text-center text-muted-foreground">
          <p>I had trouble loading your tax documents. Please try refreshing.</p>
        </div>
      ) : (
        <div className="space-y-4 md:flex-1 md:overflow-auto md:min-h-0">
          <TaxDocumentsAccordion
            documents={data?.documents ?? []}
            onViewDocument={handleViewDocument}
          />
          <TaxDocumentChecklist items={data?.checklist ?? []} />
        </div>
      )}

      {viewingDocId ? (
        <DocumentViewer
          documentId={viewingDocId}
          onClose={() => setViewingDocId(null)}
        />
      ) : null}
    </main>
  );
}
