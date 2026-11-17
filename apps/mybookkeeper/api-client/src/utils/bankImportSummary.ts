import { formatCount } from "@platform/core/utils/count";
import type { ImportResult } from "../types/transaction/ImportResult";

/** "Imported 12 transactions, 3 duplicates skipped" — the same words on the website and the phone. */
export function bankImportSummary(result: ImportResult): string {
  return `Imported ${formatCount(result.imported, "transaction")}` + (result.skipped_duplicates > 0 ? `, ${formatCount(result.skipped_duplicates, "duplicate")} skipped` : "");
}
