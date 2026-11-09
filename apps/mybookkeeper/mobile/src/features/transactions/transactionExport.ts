import type { TransactionExportFormat } from "@mybookkeeper/api-client/types/transaction/TransactionExportFormat";
import { TRANSACTION_EXPORT_MESSAGES as MESSAGES } from "../../constants/transactionExport";
import { isExportLimitError } from "../tax/taxReportDisplay";

export function exportFileName(format: TransactionExportFormat): string {
  return `transactions.${format}`;
}

/** The download skips the API client, so only a rate limit is told apart from the rest. */
export function exportFailureMessage(format: TransactionExportFormat, error: unknown): string {
  if (isExportLimitError(error)) return MESSAGES.tooMany;
  return format === "csv" ? MESSAGES.couldntExportCsv : MESSAGES.couldntExportPdf;
}
