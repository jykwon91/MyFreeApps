import { MERGEABLE_FIELDS } from "../constants/mergeableTransactionFields";
import type { DuplicateTransaction } from "../types/transaction/DuplicateTransaction";
import type { MergeableField } from "../types/transaction/MergeableField";
import type { MergeFieldSide } from "../types/transaction/MergeFieldSide";

export function getRawValue(field: MergeableField, txn: DuplicateTransaction): string | null {
  return txn[field] as string | null;
}

/** The fields the two sides disagree on: the only ones worth choosing between. */
export function differingFields(txnA: DuplicateTransaction, txnB: DuplicateTransaction): MergeableField[] {
  return MERGEABLE_FIELDS.filter((field) => {
    const rawA = getRawValue(field, txnA);
    const rawB = getRawValue(field, txnB);
    return !(rawA === null && rawB === null) && rawA !== rawB;
  });
}

export function computeDefaults(
  txnA: DuplicateTransaction,
  txnB: DuplicateTransaction,
): Record<MergeableField, MergeFieldSide> {
  const result = {} as Record<MergeableField, MergeFieldSide>;

  for (const field of MERGEABLE_FIELDS) {
    const valA = getRawValue(field, txnA);
    const valB = getRawValue(field, txnB);

    if (valA === valB) {
      result[field] = "a";
      continue;
    }

    switch (field) {
      case "transaction_date": {
        result[field] = (valA ?? "") <= (valB ?? "") ? "a" : "b";
        break;
      }
      case "amount": {
        result[field] = "a";
        break;
      }
      case "category": {
        if (valA && valA !== "uncategorized") result[field] = "a";
        else if (valB && valB !== "uncategorized") result[field] = "b";
        else result[field] = "a";
        break;
      }
      case "vendor":
      case "description": {
        if (valA && valB) result[field] = valA.length >= valB.length ? "a" : "b";
        else result[field] = valA ? "a" : "b";
        break;
      }
      case "property_id":
      case "payment_method":
      case "channel": {
        result[field] = valA ? "a" : "b";
        break;
      }
    }
  }

  return result;
}

export function computeSurvivingId(
  txnA: DuplicateTransaction,
  txnB: DuplicateTransaction,
): "a" | "b" {
  let countA = 0;
  let countB = 0;
  for (const field of MERGEABLE_FIELDS) {
    if (getRawValue(field, txnA) !== null) countA++;
    if (getRawValue(field, txnB) !== null) countB++;
  }
  return countA >= countB ? "a" : "b";
}
