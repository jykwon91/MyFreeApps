import { useTable, flexRender, type RowData } from "@tanstack/react-table";
import { cn } from "../../utils/cn";
import Skeleton from "../ui/Skeleton";
import DataTableHeaderCell from "./DataTableHeaderCell";
import DataTableBodyRow from "./DataTableBodyRow";
import DataTableLinkRow from "./DataTableLinkRow";
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
  getRowHref,
  primaryColumnId,
  getRowActionLabel,
  getRowId,
  className,
  sorting,
  defaultSorting,
  onSortingChange,
  manualSorting = false,
  enableSortingRemoval = true,
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
    manualSorting,
    enableSortingRemoval,
    manualPagination: pageCount !== undefined,
    pageCount: pageCount,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const showEmpty = !loading && rows.length === 0 && emptyState;
  const columnIds = table.getAllLeafColumns().map((column) => column.id);
  if (primaryColumnId !== undefined && !columnIds.includes(primaryColumnId)) {
    throw new Error(`DataTable: primaryColumnId "${primaryColumnId}" is not one of its columns`);
  }
  const opens = onRowClick !== undefined || getRowHref !== undefined;
  const actionColumnId = opens ? (primaryColumnId ?? columnIds[0]) : undefined;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table role="table" className="w-full text-sm border-collapse">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header) => (
                <DataTableHeaderCell
                  key={header.id}
                  column={header.column}
                  label={header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                />
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
            : rows.map((row, idx) => {
                const rowProps = {
                  row,
                  striped: idx % 2 === 1,
                  actionColumnId,
                  actionLabel: getRowActionLabel?.(row.original),
                };
                if (getRowHref) return <DataTableLinkRow key={row.id} {...rowProps} href={getRowHref(row.original)} />;
                return (
                  <DataTableBodyRow
                    key={row.id}
                    {...rowProps}
                    onOpen={onRowClick ? () => onRowClick(row.original) : undefined}
                  />
                );
              })}
        </tbody>
      </table>
      {showEmpty && <div className="py-4">{emptyState}</div>}
    </div>
  );
}
