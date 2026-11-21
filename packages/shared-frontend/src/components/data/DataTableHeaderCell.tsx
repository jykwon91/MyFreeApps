import { cn } from "../../utils/cn";
import SortDirectionIcon from "./SortDirectionIcon";
import type { DataTableHeaderCellProps } from "../../types/data-table-header-cell-props";

/**
 * One column header. A sortable column's label is a real button, so it can be
 * reached with Tab and sorted with Enter or Space as well as a click or tap.
 */
export default function DataTableHeaderCell({ column, label, children }: DataTableHeaderCellProps) {
  const canSort = column.getCanSort();
  const sortDir = column.getIsSorted();

  return (
    <th
      scope="col"
      aria-sort={
        sortDir === "asc"
          ? "ascending"
          : sortDir === "desc"
          ? "descending"
          : canSort
          ? "none"
          : undefined
      }
      className="h-11 px-3 text-left font-medium text-muted-foreground whitespace-nowrap"
    >
      <div className="flex items-center gap-1">
        {canSort ? (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className={cn(
              "-mx-1 inline-flex min-h-[44px] items-center gap-1 rounded-sm px-1 font-medium select-none",
              "hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            {label}
            <SortDirectionIcon direction={sortDir} />
          </button>
        ) : (
          label
        )}
        {children}
      </div>
    </th>
  );
}
