import { format, parseISO } from "date-fns";
import { formatTag } from "@/shared/utils/tag";
import type { DuplicateTransaction } from "@mybookkeeper/api-client/types/transaction/DuplicateTransaction";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { FIELD_LABELS } from "@mybookkeeper/api-client/constants/mergeableTransactionFields";
import { differingFields } from "@mybookkeeper/api-client/utils/mergeDefaults";
import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";

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

export interface MergePreviewProps {
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  selections: Record<MergeableField, MergeFieldSide>;
  propertyMap: Map<string, string>;
}

export default function MergePreview({ txnA, txnB, selections, propertyMap }: MergePreviewProps) {
  // Only show fields that have a conflict (were selectable)
  const conflictedFields = differingFields(txnA, txnB);

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
