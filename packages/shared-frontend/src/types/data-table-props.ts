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
  /**
   * Controlled sort. Omit it and the table keeps its own sort state.
   *
   * Pass a value with a stable identity: React state, or a constant defined
   * outside the component. A new array literal on every render tells the table
   * the sort changed each time, so it re-syncs on every render.
   */
  sorting?: SortingState;
  /** Starting sort when `sorting` is omitted. Ignored once `sorting` is passed. */
  defaultSorting?: SortingState;
  /** Called on every sort change, in both controlled and uncontrolled mode. */
  onSortingChange?: (s: SortingState) => void;
  /**
   * The rows arrive already sorted (e.g. by the server), so header clicks only
   * update the sort for the caller to act on; the table never reorders `data`.
   */
  manualSorting?: boolean;
  /**
   * Whether a third click on a sorted header clears the sort. Pass `false` when
   * there is always a sort in effect (a server default), so the header never
   * claims the rows are unsorted.
   */
  enableSortingRemoval?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: (p: PaginationState) => void;
  pageCount?: number;
}
