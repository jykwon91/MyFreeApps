import type { ChecklistItem } from "@mybookkeeper/api-client/types/tax/ChecklistItem";
import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import type { TaxSourceDocument } from "@mybookkeeper/api-client/types/tax/TaxSourceDocument";
import { groupTaxDocumentsByType, groupTaxDocumentsByYear } from "@mybookkeeper/api-client/utils/taxDocumentGroups";
import { compareFormTypes } from "@mybookkeeper/api-client/utils/compareFormTypes";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { TAX_DOCUMENTS_MESSAGES as MESSAGES } from "../../constants/taxDocuments";
import type { TaxDocumentRow } from "../../types/TaxDocumentRow";
import type { TaxDocumentSection } from "../../types/TaxDocumentSection";

export function missingLabel(item: ChecklistItem): string {
  const form = getFormLabel(item.expected_type);
  return item.expected_from ? `${form} · ${item.expected_from}` : form;
}

export function taxDocumentName(document: TaxSourceDocument): string {
  return document.issuer_name ?? document.file_name ?? MESSAGES.unnamed;
}

export function taxDocumentRowKey(row: TaxDocumentRow): string {
  return "form_instance_id" in row ? row.form_instance_id : `${row.expected_type}:${row.expected_from ?? ""}`;
}

/**
 * Only what's missing comes from the checklist. "Received" can be wrong: the server
 * accepts any document of the same form, whoever issued it, so the list of documents
 * is what shows what I have.
 * With every year shown, the received documents are split by year too.
 */
export function taxDocumentSections({ documents, checklist }: SourceDocumentsResponse, showYears = false): TaxDocumentSection[] {
  const missing = checklist
    .filter((item) => item.status === "missing")
    .sort((a, b) => compareFormTypes(a.expected_type, b.expected_type) || missingLabel(a).localeCompare(missingLabel(b)));

  const byName = (docs: readonly TaxSourceDocument[]) => [...docs].sort((a, b) => taxDocumentName(a).localeCompare(taxDocumentName(b)));
  const received: TaxDocumentSection[] = showYears
    ? groupTaxDocumentsByYear(documents).flatMap(({ year, types }) =>
        types.map(({ type, docs }) => ({ title: MESSAGES.yearForm(year, getFormLabel(type)), data: byName(docs) })),
      )
    : groupTaxDocumentsByType(documents).map(({ type, docs }) => ({ title: getFormLabel(type), data: byName(docs) }));

  return missing.length > 0 ? [{ title: MESSAGES.stillWaiting, data: missing }, ...received] : received;
}
