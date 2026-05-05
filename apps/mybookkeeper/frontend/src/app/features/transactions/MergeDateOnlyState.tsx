import { Info } from "lucide-react";
import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import type { MergeableField } from "./merge-defaults";
import MergeFieldRow from "./MergeFieldRow";

export interface MergeDateOnlyStateProps {
  visibleFields: readonly MergeableField[];
  labelA: string;
  labelB: string;
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  propertyMap: ReadonlyMap<string, string>;
  selections: Record<MergeableField, MergeFieldSide>;
  formatFieldValue: (field: MergeableField, txn: DuplicateTransaction) => string | null;
  onSelectionChange: (field: MergeableField, side: MergeFieldSide) => void;
}

export default function MergeDateOnlyState({
  visibleFields,
  labelA,
  labelB,
  txnA,
  txnB,
  selections,
  formatFieldValue,
  onSelectionChange,
}: MergeDateOnlyStateProps) {
  return (
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
            valueA={formatFieldValue(field, txnA)}
            valueB={formatFieldValue(field, txnB)}
            selected={selections[field]}
            onSelect={(side) => onSelectionChange(field, side)}
          />
        ))}
      </div>
    </>
  );
}
