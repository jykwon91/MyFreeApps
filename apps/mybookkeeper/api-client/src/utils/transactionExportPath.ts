import type { TransactionExportFormat } from "../types/transaction/TransactionExportFormat";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";
import { queryString } from "./queryString";

type ExportQuery = Record<Exclude<keyof TransactionListParams, "limit" | "summary_kind" | "active_properties_only">, string | undefined>;

/** The export reads the same filters and order as the list, so a filter added to the list can't be left out here. */
export function transactionExportPath(format: TransactionExportFormat, filters: TransactionListParams): string {
  const query: ExportQuery = {
    property_id: filters.property_id,
    unassigned: filters.unassigned ? "true" : undefined,
    applicant_id: filters.applicant_id,
    status: filters.status,
    to_review: filters.to_review ? "true" : undefined,
    transaction_type: filters.transaction_type,
    category: filters.category,
    vendor: filters.vendor,
    start_date: filters.start_date,
    end_date: filters.end_date,
    tax_year: filters.tax_year === undefined ? undefined : String(filters.tax_year),
    tax_relevant: filters.tax_relevant === undefined ? undefined : String(filters.tax_relevant),
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
  };
  const qs = queryString(query);
  return `/exports/transactions/${format}${qs ? `?${qs}` : ""}`;
}
