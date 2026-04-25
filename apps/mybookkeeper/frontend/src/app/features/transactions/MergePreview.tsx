import { format, parseISO } from "date-fns";
import { formatTag } from "@/shared/utils/tag";
import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import {
  MERGEABLE_FIELDS,
  FIELD_LABELS,
  getRawValue,
  type MergeableField,
} from "@/app/features/transactions/merge-defaults";

function formatResolvedValue(
  field: MergeableField,
  txn: DuplicateTransaction,
  propertyMap: Map<string, string>,
): string {
  switch (field) {
    case "transaction_date":
      return txn.transaction_date ? format(parseISO(txn.transaction_date), "MMM d, yyyy") : "—";
    case "amount":
      return `$${Number(txn.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    case "category":
      return txn.category ? formatTag(txn.category) : "—";
    case "property_id":
      return txn.property_id ? (propertyMap.get(txn.property_id) ?? "Unknown") : "—";
    default: {
      const val = txn[field] as string | null;
      return val ?? "—";
    }
  }
}

interface Props {
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  selections: Record<MergeableField, MergeFieldSide>;
  propertyMap: Map<string, string>;
}

export default function MergePreview({ txnA, txnB, selections, propertyMap }: Props) {
  // Only show fields that have a conflict (were selectable)
  const conflictedFields = MERGEABLE_FIELDS.filter((field) => {
    const rawA = getRawValue(field, txnA);
    const rawB = getRawValue(field, txnB);
    if (rawA === null && rawB === null) return false;
    if (rawA === rawB) return false;
    return true;
  });

  if (conflictedFields.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Merged result preview
      </p>
      {conflictedFields.map((field) => {
        const selectedTxn = selections[field] === "a" ? txnA : txnB;
        const resolvedValue = formatResolvedValue(field, selectedTxn, propertyMap);
        return (
          <div key={field} className="flex justify-between items-baseline gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">{FIELD_LABELS[field]}</span>
            <span className="text-right font-medium truncate">{resolvedValue}</span>
          </div>
        );
      })}
    </div>
  );
}
