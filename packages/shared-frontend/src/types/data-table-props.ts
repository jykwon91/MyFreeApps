import type { RowData } from "@tanstack/react-table";
import type { DataTableBaseProps } from "./data-table-base-props";
import type { DataTableRowOpening } from "./data-table-row-opening";

export type DataTableProps<T extends RowData> = DataTableBaseProps<T> & DataTableRowOpening<T>;
