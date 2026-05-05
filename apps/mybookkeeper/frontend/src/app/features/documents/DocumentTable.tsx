import { Fragment } from "react";
import { flexRender, type Table } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { Document } from "@/shared/types/document/document";
import { PAGE_SIZE_OPTIONS, DOCUMENT_TYPE_LABELS } from "@/shared/lib/constants";
import EmptyState from "@/shared/components/ui/EmptyState";
import { SortIndicator, ColumnFilter } from "@/shared/components/table";
import StatusBadge from "@/app/features/documents/StatusBadge";
import { timeAgo } from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";

interface FilterOptions {
  [columnId: string]: { value: string; label: string }[];
}

export interface DocumentTableProps {
  table: Table<Document>;
  colCount: number;
  filterOptions: FilterOptions;
  onRowClick?: (doc: Document) => void;
}

export default function DocumentTable({ table, colCount, filterOptions, onRowClick }: DocumentTableProps) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="border rounded-lg overflow-hidden md:flex md:flex-col md:min-h-0 md:flex-1">
      {/* Mobile card view */}
      <div className="md:hidden divide-y">
        {table.getRowModel().rows.length === 0 ? (
          <EmptyState message="No documents found" />
        ) : (
          table.getRowModel().rows.map((row) => {
            const doc = row.original;
            const typeLabel = doc.document_type
              ? (DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type)
              : null;
            return (
              <button
                key={doc.id}
                onClick={() => onRowClick?.(doc)}
                className={cn(
                  "w-full text-left p-4 hover:bg-muted/50 min-h-[44px]",
                  onRowClick && "cursor-pointer",
                )}
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="font-medium text-sm truncate min-w-0">
                    {doc.file_name ?? "\u2014"}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted whitespace-nowrap">
                    {doc.source === "email" ? "Email" : "Upload"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <StatusBadge status={doc.status} errorMessage={doc.error_message} />
                  {typeLabel && (
                    <span className="text-xs text-muted-foreground">{typeLabel}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {timeAgo(doc.created_at)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-muted text-muted-foreground border-b sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className={`text-left px-4 py-2 font-medium ${canSort ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIndicator header={header} />
                        {header.column.getCanFilter() && filterOptions[header.column.id] ? (
                          <ColumnFilter
                            column={header.column}
                            options={filterOptions[header.column.id]}
                          />
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {table.getRowModel().rows.map((row) => (
              <Fragment key={row.original.id}>
                <tr
                  className={`hover:bg-muted/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 border-b">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState message="No documents found" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 text-sm text-muted-foreground shrink-0">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="border rounded px-1.5 py-0.5 text-xs bg-background"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span>{totalRows > 0 ? `${start}\u2013${end} of ${totalRows}` : "0 results"}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
