import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import type { MergeableField } from "./merge-defaults";
import MergeFieldRow from "./MergeFieldRow";

export interface MergeConflictsStateProps {
  visibleFields: readonly MergeableField[];
  labelA: string;
  labelB: string;
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  selections: Record<MergeableField, MergeFieldSide>;
  formatFieldValue: (field: MergeableField, txn: DuplicateTransaction) => string | null;
  onSelectionChange: (field: MergeableField, side: MergeFieldSide) => void;
}

export default function MergeConflictsState({
  visibleFields,
  labelA,
  labelB,
  txnA,
  txnB,
  selections,
  formatFieldValue,
  onSelectionChange,
}: MergeConflictsStateProps) {
  return (
    <div className="rounded-md border divide-y overflow-hidden">
      {visibleFields.map((field) => {
        const valueA = formatFieldValue(field, txnA);
        const valueB = formatFieldValue(field, txnB);
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
  );
}
