import { Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTag } from "@/shared/utils/tag";
import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import {
  MERGEABLE_FIELDS,
  getRawValue,
  type MergeableField,
} from "@/app/features/transactions/merge-defaults";
import { useMergeFieldPickerMode } from "./useMergeFieldPickerMode";
import MergeFieldPickerBody from "./MergeFieldPickerBody";

function formatFieldValue(
  field: MergeableField,
  txn: DuplicateTransaction,
  propertyMap: ReadonlyMap<string, string>,
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

export interface MergeFieldPickerProps {
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  labelA: string;
  labelB: string;
  propertyMap: ReadonlyMap<string, string>;
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
}: MergeFieldPickerProps) {
  const allTags = [...new Set([...(txnA.tags ?? []), ...(txnB.tags ?? [])])];

  // Build rows — skip fields where both values are identical or both null
  const visibleFields = MERGEABLE_FIELDS.filter((field) => {
    const rawA = getRawValue(field, txnA);
    const rawB = getRawValue(field, txnB);
    if (rawA === null && rawB === null) return false;
    if (rawA === rawB) return false;
    return true;
  });

  const mode = useMergeFieldPickerMode({ visibleFields });

  return (
    <div className="space-y-0">
      <MergeFieldPickerBody
        mode={mode}
        visibleFields={visibleFields}
        labelA={labelA}
        labelB={labelB}
        txnA={txnA}
        txnB={txnB}
        propertyMap={propertyMap}
        selections={selections}
        formatFieldValue={(field, txn) => formatFieldValue(field, txn, propertyMap)}
        onSelectionChange={onSelectionChange}
      />

      {allTags.length > 0 && (
        <div className="flex items-center gap-2 pt-3 text-sm text-muted-foreground">
          <Info size={13} className="shrink-0" />
          Tags: union of both sides ({allTags.length} total)
        </div>
      )}
    </div>
  );
}
