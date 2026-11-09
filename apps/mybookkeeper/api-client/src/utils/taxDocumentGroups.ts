import type { TaxDocumentTypeGroup } from "../types/tax/TaxDocumentTypeGroup";
import type { TaxDocumentYearGroup } from "../types/tax/TaxDocumentYearGroup";
import type { TaxSourceDocument } from "../types/tax/TaxSourceDocument";
import { compareFormTypes } from "./compareFormTypes";

/** Documents under their form type, in tax-form order. Within a type they keep the order they came in. */
export function groupTaxDocumentsByType(documents: readonly TaxSourceDocument[]): TaxDocumentTypeGroup[] {
  const groups = new Map<string, TaxSourceDocument[]>();
  for (const doc of documents) {
    const docs = groups.get(doc.document_type);
    if (docs) docs.push(doc);
    else groups.set(doc.document_type, [doc]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareFormTypes(a, b))
    .map(([type, docs]) => ({ type, docs }));
}

/** Newest year first, each year's forms in tax-form order and its documents by issuer. */
export function groupTaxDocumentsByYear(documents: readonly TaxSourceDocument[]): TaxDocumentYearGroup[] {
  const byYear = new Map<number, TaxSourceDocument[]>();
  for (const doc of documents) {
    const docs = byYear.get(doc.tax_year);
    if (docs) docs.push(doc);
    else byYear.set(doc.tax_year, [doc]);
  }
  return [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      types: groupTaxDocumentsByType(byYear.get(year) ?? []).map(({ type, docs }) => ({
        type,
        docs: docs.slice().sort((a, b) => (a.issuer_name ?? "").localeCompare(b.issuer_name ?? "")),
      })),
    }));
}
