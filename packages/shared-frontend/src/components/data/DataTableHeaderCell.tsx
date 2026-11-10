import { flexRender, type RowData } from "@tanstack/react-table";
import { cn } from "../../utils/cn";
import SortDirectionIcon from "./SortDirectionIcon";
import type { DataTableHeaderCellProps } from "../../types/data-table-header-cell-props";

/**
 * One column header. A sortable column's label is a real button, so it can be
 * reached with Tab and sorted with Enter or Space as well as a click or tap.
 */
export default function DataTableHeaderCell<T extends RowData>({ header }: DataTableHeaderCellProps<T>) {
  const canSort = header.column.getCanSort();
  const sortDir = header.column.getIsSorted();
  const label = header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext());

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
      {canSort ? (
        <button
          type="button"
          onClick={header.column.getToggleSortingHandler()}
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
    </th>
  );
}
