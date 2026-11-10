import type { SortingState } from "@tanstack/react-table";
import type { ColumnDef } from "../types/data-table-column-def";

export interface ControlledSortDataTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T>[];
  onSortingChange: (next: SortingState) => void;
}
