import { useTable, flexRender, type RowData } from "@tanstack/react-table";
import { cn } from "../../utils/cn";
import Skeleton from "../ui/Skeleton";
import DataTableHeaderCell from "./DataTableHeaderCell";
import { useControllableState } from "../../hooks/useControllableState";
import { DATA_TABLE_FEATURES } from "../../constants/data-table-features";
import { DATA_TABLE_DEFAULT_PAGINATION } from "../../constants/data-table-default-pagination";
import type { DataTableFeatures } from "../../types/data-table-features";
import type { DataTableProps } from "../../types/data-table-props";

export default function DataTable<T extends RowData>({
  data,
  columns,
  loading = false,
  loadingRowCount = 5,
  emptyState,
  onRowClick,
  getRowId,
  className,
  sorting,
  defaultSorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  pageCount,
}: DataTableProps<T>) {
  // Sorting and pagination always run through these, so headers sort whether or
  // not the page passes `sorting`. Handing TanStack `onSortingChange: undefined`
  // replaced its internal state updater and left uncontrolled headers dead.
  const [sortingState, setSorting] = useControllableState({
    value: sorting,
    defaultValue: defaultSorting ?? [],
    onChange: onSortingChange,
  });
  const [paginationState, setPagination] = useControllableState({
    value: pagination,
    defaultValue: DATA_TABLE_DEFAULT_PAGINATION,
    onChange: onPaginationChange,
  });

  const table = useTable<DataTableFeatures, T>({
    features: DATA_TABLE_FEATURES,
    data,
    columns,
    state: { sorting: sortingState, pagination: paginationState },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    manualPagination: pageCount !== undefined,
    pageCount: pageCount,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const showEmpty = !loading && rows.length === 0 && emptyState;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table role="table" className="w-full text-sm border-collapse">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header) => (
                <DataTableHeaderCell key={header.id} header={header} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRowCount }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b">
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className="px-3 py-2.5">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b transition-colors",
                    idx % 2 === 1 && "bg-muted/30",
                    onRowClick && "cursor-pointer hover:bg-muted/60"
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {showEmpty && <div className="py-4">{emptyState}</div>}
    </div>
  );
}
