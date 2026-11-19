import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";
import type { SelectAllControl } from "@/shared/types/select-all-control";

/** The ticked rows of the transactions table, which can sit on pages other than the one shown. */
export interface TransactionSelection {
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  /** Ticks or unticks a row; with ``extendRange``, every row on the page back to the last one toggled. */
  toggleRow: (id: string, extendRange: boolean) => void;
  selectedRefs: TransactionSelectionRef[];
  /** True while the ticks are checked against new filters: bulk actions wait until it's done. */
  isChecking: boolean;
  selectAll: SelectAllControl;
  clear: () => void;
  remove: (ids: readonly string[]) => void;
}
