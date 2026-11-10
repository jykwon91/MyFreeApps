import type { SortDirection } from "@tanstack/react-table";

export interface SortDirectionIconProps {
  /** The column's current sort, or `false` when it isn't sorted. */
  direction: SortDirection | false;
}
