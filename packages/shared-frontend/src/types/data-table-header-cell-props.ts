import type { ReactNode } from "react";
import type { SortableColumn } from "./sortable-column";

export interface DataTableHeaderCellProps {
  column: SortableColumn;
  /** The rendered column title; null for a placeholder header. */
  label: ReactNode;
  /** Extra controls beside the sort button (a column filter), kept outside it so buttons never nest. */
  children?: ReactNode;
}
