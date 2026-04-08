import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";

export type MergeableField =
  | "transaction_date"
  | "vendor"
  | "description"
  | "amount"
  | "category"
  | "property_id"
  | "payment_method"
  | "channel";

export const MERGEABLE_FIELDS: MergeableField[] = [
  "transaction_date",
  "vendor",
  "description",
  "amount",
  "category",
  "property_id",
  "payment_method",
  "channel",
];

export const FIELD_LABELS: Record<MergeableField, string> = {
  transaction_date: "Date",
  vendor: "Vendor",
  description: "Description",
  amount: "Amount",
  category: "Category",
  property_id: "Property",
  payment_method: "Payment Method",
  channel: "Channel",
};

export function getRawValue(field: MergeableField, txn: DuplicateTransaction): string | null {
  return txn[field] as string | null;
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
