import type { MergeFieldPickerMode } from "@/shared/types/transaction/merge-field-picker-mode";
import type { DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import type { MergeableField } from "./merge-defaults";
import MergeNoConflictsState from "./MergeNoConflictsState";
import MergeDateOnlyState from "./MergeDateOnlyState";
import MergeConflictsState from "./MergeConflictsState";

export interface MergeFieldPickerBodyProps {
  mode: MergeFieldPickerMode;
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

export default function MergeFieldPickerBody({
  mode,
  visibleFields,
  labelA,
  labelB,
  txnA,
  txnB,
  propertyMap,
  selections,
  formatFieldValue,
  onSelectionChange,
}: MergeFieldPickerBodyProps) {
  switch (mode) {
    case "no-conflicts":
      return <MergeNoConflictsState />;
    case "date-only":
      return (
        <MergeDateOnlyState
          visibleFields={visibleFields}
          labelA={labelA}
          labelB={labelB}
          txnA={txnA}
          txnB={txnB}
          propertyMap={propertyMap}
          selections={selections}
          formatFieldValue={formatFieldValue}
          onSelectionChange={onSelectionChange}
        />
      );
    case "conflicts":
      return (
        <MergeConflictsState
          visibleFields={visibleFields}
          labelA={labelA}
          labelB={labelB}
          txnA={txnA}
          txnB={txnB}
          selections={selections}
          formatFieldValue={formatFieldValue}
          onSelectionChange={onSelectionChange}
        />
      );
  }
}
