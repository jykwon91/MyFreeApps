import type { DuplicatePair } from "../types/transaction/DuplicatePair";
import type { DuplicateTransaction } from "../types/transaction/DuplicateTransaction";

export function duplicateSourceLabel(txn: DuplicateTransaction): string {
  if (txn.source_file_name) {
    const ext = txn.source_file_name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "Invoice/PDF";
    if (ext === "csv" || ext === "xlsx") return "Bank import";
  }
  if (txn.is_manual) return "Manual entry";
  return "Document";
}

export function duplicateConfidenceLabel(confidence: string): string {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    default:
      return "Low confidence";
  }
}

/** "Same amount, same date" or "Same amount, 3 days apart". */
export function duplicateHeadline(pair: Pick<DuplicatePair, "date_diff_days">): string {
  if (pair.date_diff_days === 0) return "Same amount, same date";
  return `Same amount, ${pair.date_diff_days} day${pair.date_diff_days === 1 ? "" : "s"} apart`;
}
