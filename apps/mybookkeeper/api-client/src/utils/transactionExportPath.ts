import type { TransactionExportFormat } from "../types/transaction/TransactionExportFormat";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";
import { pathWithQuery } from "./pathWithQuery";
import { transactionListQuery } from "./transactionListQuery";

/** The export reads the same filters and order as the list, with no row limit. */
export function transactionExportPath(format: TransactionExportFormat, filters: TransactionListParams): string {
  const qs = transactionListQuery({ ...filters, limit: undefined, summary_kind: undefined, active_properties_only: undefined });
  return pathWithQuery(`/exports/transactions/${format}`, qs);
}
