import type { RowData } from "@tanstack/react-table";

/** Where a row's control sits and what it is called, for a table whose rows open. */
export interface DataTableRowActionOptions<T extends RowData> {
  /**
   * The column whose cell holds the row's link or button. Defaults to the
   * first column. Its cell must render text and no controls of its own, since
   * controls can't nest.
   */
  primaryColumnId?: string;
  /**
   * The control's accessible name, when the primary cell alone doesn't say
   * which row it opens (a company name shared by several applications, or a
   * blank cell). Defaults to the cell's text.
   */
  getRowActionLabel?: (row: T) => string;
}
