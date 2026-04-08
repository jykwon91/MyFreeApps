import { useState, useMemo } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { getFormLabel, FORM_TYPE_ORDER } from "@/shared/lib/tax-config";
import FormTypeGroup from "@/app/features/tax/FormTypeGroup";
import type { TaxSourceDocument } from "@/shared/types/tax/source-document";

interface TaxDocumentsAccordionProps {
  documents: TaxSourceDocument[];
  onViewDocument: (documentId: string) => void;
}

export default function TaxDocumentsAccordion({
  documents,
  onViewDocument,
}: TaxDocumentsAccordionProps) {
  const grouped = useMemo(() => {
    const byYear = new Map<number, Map<string, TaxSourceDocument[]>>();
    for (const doc of documents) {
      if (!byYear.has(doc.tax_year)) {
        byYear.set(doc.tax_year, new Map());
      }
      const byType = byYear.get(doc.tax_year)!;
      if (!byType.has(doc.document_type)) {
        byType.set(doc.document_type, []);
      }
      byType.get(doc.document_type)!.push(doc);
    }

    // Sort years descending
    const sortedYears = [...byYear.keys()].sort((a, b) => b - a);

    return sortedYears.map((year) => {
      const byType = byYear.get(year)!;
      // Sort form types by FORM_TYPE_ORDER; unknowns go to end alphabetically
      const sortedTypes = [...byType.keys()].sort((a, b) => {
        const ai = FORM_TYPE_ORDER.indexOf(a);
        const bi = FORM_TYPE_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return {
        year,
        types: sortedTypes.map((type) => ({
          type,
          docs: byType.get(type)!.slice().sort((a, b) =>
            (a.issuer_name ?? "").localeCompare(b.issuer_name ?? ""),
          ),
        })),
      };
    });
  }, [documents]);

  const mostRecentYear = grouped[0]?.year;

  // Controlled year accordion so we can read open state for collapsed hints
  const [openYears, setOpenYears] = useState<string[]>(
    mostRecentYear != null ? [String(mostRecentYear)] : [],
  );

  if (documents.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="font-medium">No tax documents yet</p>
        <p className="text-sm mt-1">
          Upload W-2s, 1099s, and other tax forms on the{" "}
          <Link to="/documents" className="text-primary hover:underline">
            Documents
          </Link>{" "}
          page and they'll appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Accordion.Root
        type="multiple"
        value={openYears}
        onValueChange={setOpenYears}
        className="space-y-2"
      >
        {grouped.map(({ year, types }) => {
          const totalDocs = types.reduce((s, t) => s + t.docs.length, 0);
          const isOpen = openYears.includes(String(year));
          const isNewest = year === mostRecentYear;

          return (
            <Accordion.Item
              key={year}
              value={String(year)}
              className="border rounded-lg overflow-hidden"
            >
              <Accordion.Header>
                <Accordion.Trigger className="w-full flex items-center gap-2 px-3 py-3 bg-muted/40 hover:bg-muted/60 text-left [&[data-state=open]>svg]:rotate-90">
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150" />
                  <span className="font-semibold text-sm">{year}</span>
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {totalDocs}
                  </span>
                  {!isOpen && (
                    <div className="flex gap-1 flex-wrap ml-2">
                      {types.map(({ type }) => (
                        <span
                          key={type}
                          className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium"
                        >
                          {getFormLabel(type)}
                        </span>
                      ))}
                    </div>
                  )}
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pl-3 data-[state=closed]:animate-none overflow-hidden data-[state=open]:animate-none">
                <Accordion.Root
                  type="multiple"
                  defaultValue={isNewest ? types.map((t) => t.type) : []}
                >
                  {types.map(({ type, docs }) => (
                    <FormTypeGroup
                      key={type}
                      formType={type}
                      docs={docs}
                      onView={onViewDocument}
                    />
                  ))}
                </Accordion.Root>
              </Accordion.Content>
            </Accordion.Item>
          );
        })}
      </Accordion.Root>
    </div>
  );
}
