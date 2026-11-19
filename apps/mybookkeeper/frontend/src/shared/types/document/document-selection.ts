import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import type { SelectAllControl } from "@/shared/types/select-all-control";

/** The ticked rows of the Documents table, which can include documents not loaded yet. */
export interface DocumentSelection {
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  selectedIds: string[];
  /** True while the ticks are checked against new filters: bulk actions wait until it's done. */
  isChecking: boolean;
  selectAll: SelectAllControl;
  /** Keeps only ``ids`` ticked, e.g. the ones a bulk delete couldn't delete, so they can be retried. */
  keepOnly: (ids: readonly string[]) => void;
  clear: () => void;
}
