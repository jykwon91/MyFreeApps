import type { TransactionExportFormat } from "../types/transaction/TransactionExportFormat";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";
import { queryString } from "./queryString";

export function transactionExportPath(format: TransactionExportFormat, filters: TransactionListParams): string {
  // Only the filters the export endpoints read; the server ignores the rest of a list's.
  const qs = queryString({
    property_id: filters.property_id,
    status: filters.status,
    transaction_type: filters.transaction_type,
    category: filters.category,
    vendor: filters.vendor,
    start_date: filters.start_date,
    end_date: filters.end_date,
  });
  return `/exports/transactions/${format}${qs ? `?${qs}` : ""}`;
}
