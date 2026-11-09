import type { TransactionExportFormat } from "@mybookkeeper/api-client/types/transaction/TransactionExportFormat";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { TRANSACTION_EXPORT_MESSAGES as MESSAGES } from "../../constants/transactionExport";
import { isExportLimitError } from "../tax/taxReportDisplay";

export function exportFileName(format: TransactionExportFormat): string {
  return `transactions.${format}`;
}

/** The export reads property, status, type, category and dates. The rest of a list's narrowing isn't sent. */
export function notAppliedToExport(params: TransactionListParams): string | null {
  const parts = [params.vendor ? "the vendor search" : null, params.to_review ? "the review list" : null, params.unassigned ? "no property" : null].filter(Boolean);
  return parts.length > 0 ? MESSAGES.notApplied(parts.join(", ")) : null;
}

/** The download skips the API client, so only a rate limit is told apart from the rest. */
export function exportFailureMessage(format: TransactionExportFormat, error: unknown): string {
  if (isExportLimitError(error)) return MESSAGES.tooMany;
  return format === "csv" ? MESSAGES.couldntExportCsv : MESSAGES.couldntExportPdf;
}
