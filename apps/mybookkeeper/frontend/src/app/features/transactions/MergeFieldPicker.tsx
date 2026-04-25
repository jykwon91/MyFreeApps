import { Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTag } from "@/shared/utils/tag";
import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import {
  MERGEABLE_FIELDS,
  getRawValue,
  type MergeableField,
} from "@/app/features/transactions/merge-defaults";
import MergeFieldRow from "@/app/features/transactions/MergeFieldRow";

function formatFieldValue(
  field: MergeableField,
  txn: DuplicateTransaction,
  propertyMap: Map<string, string>,
): string | null {
  switch (field) {
    case "transaction_date":
      return txn.transaction_date ? format(parseISO(txn.transaction_date), "MMM d, yyyy") : null;
    case "vendor":
      return txn.vendor;
    case "description":
      return txn.description;
    case "amount":
      return `$${Number(txn.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    case "category":
      return txn.category ? formatTag(txn.category) : null;
    case "property_id":
      return txn.property_id ? (propertyMap.get(txn.property_id) ?? "Unknown") : null;
    case "payment_method":
      return txn.payment_method;
    case "channel":
      return txn.channel;
  }
}

interface Props {
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  labelA: string;
  labelB: string;
  propertyMap: Map<string, string>;
  selections: Record<MergeableField, MergeFieldSide>;
  onSelectionChange: (field: MergeableField, side: MergeFieldSide) => void;
}

export default function MergeFieldPicker({
  txnA,
  txnB,
  labelA,
  labelB,
  propertyMap,
  selections,
  onSelectionChange,
}: Props) {
  const allTags = [...new Set([...(txnA.tags ?? []), ...(txnB.tags ?? [])])];

  // Build rows — skip fields where both values are identical or both null
  const visibleFields = MERGEABLE_FIELDS.filter((field) => {
    const rawA = getRawValue(field, txnA);
    const rawB = getRawValue(field, txnB);
    if (rawA === null && rawB === null) return false;
    if (rawA === rawB) return false;
    return true;
  });

  const allConflictsMatch = visibleFields.length === 0;
  const onlyDateDiffers = visibleFields.length === 1 && visibleFields[0] === "transaction_date";

  return (
    <div className="space-y-0">
      {allConflictsMatch ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          <Info size={14} className="shrink-0" />
          No conflicts found — all fields match. Ready to merge.
        </div>
      ) : onlyDateDiffers ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
            <Info size={14} className="shrink-0" />
            These look like the same expense from different dates. Which date is correct?
          </div>
          <div className="rounded-md border divide-y overflow-hidden mt-2">
            {visibleFields.map((field) => (
              <MergeFieldRow
                key={field}
                field={field}
                labelA={labelA}
                labelB={labelB}
                valueA={formatFieldValue(field, txnA, propertyMap)}
                valueB={formatFieldValue(field, txnB, propertyMap)}
                selected={selections[field]}
                onSelect={(side) => onSelectionChange(field, side)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-md border divide-y overflow-hidden">
          {visibleFields.map((field) => {
            const valueA = formatFieldValue(field, txnA, propertyMap);
            const valueB = formatFieldValue(field, txnB, propertyMap);
            const showAmountWarning = field === "amount" && txnA.amount !== txnB.amount;

            return (
              <MergeFieldRow
                key={field}
                field={field}
                labelA={labelA}
                labelB={labelB}
                valueA={valueA}
                valueB={valueB}
                selected={selections[field]}
                onSelect={(side) => onSelectionChange(field, side)}
                showAmountWarning={showAmountWarning}
              />
            );
          })}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="flex items-center gap-2 pt-3 text-sm text-muted-foreground">
          <Info size={13} className="shrink-0" />
          Tags: union of both sides ({allTags.length} total)
        </div>
      )}
    </div>
  );
}
