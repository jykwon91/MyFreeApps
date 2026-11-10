import type { ColumnDef as TableColumnDef, RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "./data-table-features";

/** A column definition bound to DataTable's feature set. */
export type ColumnDef<T extends RowData, TValue = unknown> = TableColumnDef<
  DataTableFeatures,
  T,
  TValue
>;
