import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import type { DuplicateTransaction } from "@mybookkeeper/api-client/types/transaction/DuplicateTransaction";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { duplicateSourceLabel } from "@mybookkeeper/api-client/utils/duplicatePairLabels";
import type { DuplicateMergeMode } from "../../types/DuplicateMergeMode";
import { formatCurrency } from "@platform/core/utils/currency";
import { fullDateLabel } from "../../lib/localDate";
import { categoryLabel, propertyLabel, statusLabel } from "../transactions/transactionDisplay";

export function duplicateCountLine(count: number): string {
  return count === 1 ? "1 possible duplicate" : `${count} possible duplicates`;
}

/** The text of one field of a record, or null when it has none. */
export function duplicateFieldValue(field: MergeableField, txn: DuplicateTransaction, properties: readonly Property[]): string | null {
  switch (field) {
    case "transaction_date":
      return txn.transaction_date ? fullDateLabel(txn.transaction_date) : null;
    case "amount":
      return formatCurrency(Number(txn.amount));
    case "category":
      return txn.category ? categoryLabel(txn.category) : null;
    case "property_id":
      return txn.property_id ? propertyLabel(txn.property_id, properties) : null;
    case "vendor":
    case "description":
    case "payment_method":
    case "channel":
      return txn[field];
  }
}

/** "Record A: Invoice/PDF". The source alone can match on both sides. */
export function duplicateSideLabel(side: MergeFieldSide, txn: DuplicateTransaction): string {
  return `Record ${side.toUpperCase()}: ${duplicateSourceLabel(txn)}`;
}

export function duplicatePairName(pair: DuplicatePair): string {
  const { transaction_a: a, transaction_b: b } = pair;
  return a.vendor || b.vendor || a.description || b.description || "Untitled transaction";
}

/** How many records back a transaction: its own document and the ones linked to it. */
export function duplicateSourceCount(txn: DuplicateTransaction): number {
  return (txn.linked_document_ids?.length ?? 0) + (txn.source_document_id ? 1 : 0);
}

export function duplicateMergeMode(differing: readonly MergeableField[]): DuplicateMergeMode {
  if (differing.length === 0) return "no-conflicts";
  if (differing.length === 1 && differing[0] === "transaction_date") return "date-only";
  return "conflicts";
}

/** Tags from both sides are kept on a merge. */
export function mergedTagCount(a: DuplicateTransaction, b: DuplicateTransaction): number {
  return new Set([...(a.tags ?? []), ...(b.tags ?? [])]).size;
}

/** The server sends the status as plain text; one it doesn't know reads as it came. */
export function duplicateStatusLabel(status: string): string {
  return statusLabel(status as TransactionStatus) ?? status;
}
