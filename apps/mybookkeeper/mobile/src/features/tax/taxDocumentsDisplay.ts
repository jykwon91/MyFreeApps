import type { ChecklistItem } from "@mybookkeeper/api-client/types/tax/ChecklistItem";
import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import type { TaxSourceDocument } from "@mybookkeeper/api-client/types/tax/TaxSourceDocument";
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
 */
export function taxDocumentSections({ documents, checklist }: SourceDocumentsResponse): TaxDocumentSection[] {
  const missing = checklist
    .filter((item) => item.status === "missing")
    .sort((a, b) => compareFormTypes(a.expected_type, b.expected_type) || missingLabel(a).localeCompare(missingLabel(b)));

  const forms = [...new Set(documents.map((document) => document.document_type))].sort(compareFormTypes);
  const received = forms.map((form) => ({
    title: getFormLabel(form),
    data: documents
      .filter((document) => document.document_type === form)
      .sort((a, b) => taxDocumentName(a).localeCompare(taxDocumentName(b))),
  }));

  return missing.length > 0 ? [{ title: MESSAGES.stillWaiting, data: missing }, ...received] : received;
}
