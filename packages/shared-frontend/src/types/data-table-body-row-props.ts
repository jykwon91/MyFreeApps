import type { Row, RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "./data-table-features";

export interface DataTableBodyRowProps<T extends RowData> {
  row: Row<DataTableFeatures, T>;
  striped: boolean;
  /** The column whose cell holds the row's control; undefined when the row doesn't open. */
  actionColumnId?: string;
  /** Opens the row: called by the row's button and by a click on the rest of the row. */
  onOpen?: () => void;
  /** Where the row's link goes; when set, the control is a link instead of a button. */
  href?: string;
  actionLabel?: string;
}
