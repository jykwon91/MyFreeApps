import type { ReactNode } from "react";
import type { PaginationState, RowData, SortingState } from "@tanstack/react-table";
import type { ColumnDef } from "./data-table-column-def";

export interface DataTableProps<T extends RowData> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  loadingRowCount?: number;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  className?: string;
  /** Controlled sort. Omit it and the table keeps its own sort state. */
  sorting?: SortingState;
  /** Starting sort when `sorting` is omitted. Ignored once `sorting` is passed. */
  defaultSorting?: SortingState;
  /** Called on every sort change, in both controlled and uncontrolled mode. */
  onSortingChange?: (s: SortingState) => void;
  pagination?: PaginationState;
  onPaginationChange?: (p: PaginationState) => void;
  pageCount?: number;
}
