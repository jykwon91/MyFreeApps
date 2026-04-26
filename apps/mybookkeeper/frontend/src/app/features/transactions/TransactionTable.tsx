import { Fragment } from "react";
import { flexRender, type Table } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { FilterOptions } from "@/shared/types/transaction/filter-options";
import { PAGE_SIZE_OPTIONS, TAG_COLORS } from "@/shared/lib/constants";
import EmptyState from "@/shared/components/ui/EmptyState";
import { SortIndicator, ColumnFilter } from "@/shared/components/table";
import TransactionStatusBadge from "@/app/features/transactions/TransactionStatusBadge";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import { cn } from "@/shared/utils/cn";

interface Props {
  table: Table<Transaction>;
  colCount: number;
  onRowClick: (transaction: Transaction) => void;
  editingId: string | null;
  filterOptions?: FilterOptions;
  propertyMap?: ReadonlyMap<string, string>;
}

export default function TransactionTable({ table, colCount, onRowClick, editingId, filterOptions, propertyMap }: Props) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="border rounded-lg overflow-hidden md:flex md:flex-col md:min-h-0 md:flex-1">
      {/* Mobile card view */}
      <div className="md:hidden divide-y">
        {table.getRowModel().rows.length === 0 ? (
          <EmptyState
            message={
              table.getPreFilteredRowModel().rows.length === 0
                ? "No transactions yet. Upload a document on the Documents page and I'll extract transactions automatically."
                : "No transactions found"
            }
          />
        ) : (
          table.getRowModel().rows.map((row) => {
            const t = row.original;
            const isActive = editingId === t.id;
            const propertyName = t.property_id ? propertyMap?.get(t.property_id) : null;
            const categoryColor = TAG_COLORS[t.category] ?? "#94a3b8";
            return (
              <button
                key={t.id}
                onClick={() => onRowClick(t)}
                className={cn(
                  "w-full text-left p-4 hover:bg-muted/50 min-h-[44px]",
                  isActive && "bg-blue-50 dark:bg-blue-950 border-l-2 border-l-blue-500",
                  t.status === "pending" && !isActive && "bg-yellow-50/40 dark:bg-yellow-950/20",
                )}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{t.vendor || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.transaction_date)}</p>
                  </div>
                  <p className={cn(
                    "font-semibold text-sm whitespace-nowrap",
                    t.transaction_type === "income" ? "text-green-600" : "text-foreground",
                  )}>
                    {t.transaction_type === "income" ? "+" : ""}{formatCurrency(t.amount)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <TransactionStatusBadge status={t.status} />
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: categoryColor }}
                  >
                    {formatTag(t.category)}
                  </span>
                  {propertyName && (
                    <span className="text-xs text-muted-foreground">{propertyName}</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm min-w-[700px]">
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
                        {header.column.getCanFilter() && filterOptions?.[header.column.id] ? (
                          <ColumnFilter
                            column={header.column}
                            options={filterOptions[header.column.id]}
                          />
                        ) : header.column.id === "transaction_date" && header.column.getCanFilter() ? (
                          <ColumnFilter column={header.column} enableDateRange />
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
                  className={`hover:bg-muted/50 cursor-pointer ${editingId === row.original.id ? "bg-blue-50 dark:bg-blue-950 border-l-2 border-l-blue-500" : ""} ${row.original.status === "pending" && editingId !== row.original.id ? "bg-yellow-50/40 dark:bg-yellow-950/20" : ""}`}
                  onClick={() => onRowClick(row.original)}
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
                  <EmptyState
                    message={
                      table.getPreFilteredRowModel().rows.length === 0
                        ? "No transactions yet. Upload a document on the Documents page and I'll extract transactions automatically."
                        : "No transactions found"
                    }
                  />
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
            <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
