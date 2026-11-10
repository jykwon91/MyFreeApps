import type { Header, RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "./data-table-features";

export interface DataTableHeaderCellProps<T extends RowData> {
  header: Header<DataTableFeatures, T>;
}
