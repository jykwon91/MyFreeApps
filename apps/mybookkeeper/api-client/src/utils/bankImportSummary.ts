import type { ImportResult } from "../types/transaction/ImportResult";

/** "Imported 12 transaction(s), 3 duplicate(s) skipped" — the same words on the website and the phone. */
export function bankImportSummary(result: ImportResult): string {
  return `Imported ${result.imported} transaction(s)` + (result.skipped_duplicates > 0 ? `, ${result.skipped_duplicates} duplicate(s) skipped` : "");
}
