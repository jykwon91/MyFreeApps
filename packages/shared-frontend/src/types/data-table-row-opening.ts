import type { RowData } from "@tanstack/react-table";
import type { DataTableRowActionOptions } from "./data-table-row-action-options";

/**
 * How a row opens: not at all, by navigating (`getRowHref`, rendered as a
 * link so new-tab and middle-click work), or by running code (`onRowClick`,
 * rendered as a button, for panels and dialogs). Either way the row stays a
 * table row, its primary cell holds the control, and a mouse click on the rest
 * of the row does the same thing.
 */
export type DataTableRowOpening<T extends RowData> =
  | {
      onRowClick?: never;
      getRowHref?: never;
      primaryColumnId?: never;
      getRowActionLabel?: never;
    }
  | (DataTableRowActionOptions<T> & { onRowClick: (row: T) => void; getRowHref?: never })
  | (DataTableRowActionOptions<T> & { getRowHref: (row: T) => string; onRowClick?: never });
