import { Fragment } from "react";
import { flexRender, type ReactTable } from "@tanstack/react-table";
import type { AppTableFeatures } from "@/shared/lib/table-features";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { transactionAccountLabel } from "@mybookkeeper/api-client/utils/transactionAccountLabel";
import { TRANSACTION_ACCOUNT_MESSAGES as ACCOUNT_MSG } from "@/shared/lib/transaction-account-messages";
import type { FilterOptions } from "@/shared/types/transaction/filter-options";
import { PAGE_SIZE_OPTIONS, TAG_COLORS } from "@/shared/lib/constants";
import EmptyState from "@/shared/components/ui/EmptyState";
import { DataTableHeaderCell } from "@platform/ui";
import { ColumnFilter } from "@/shared/components/table";
import TransactionStatusBadge from "@/app/features/transactions/TransactionStatusBadge";
import CapitalImprovementBadge from "@/app/features/transactions/CapitalImprovementBadge";
import SplitWaysBadge from "@/app/features/transactions/SplitWaysBadge";
import { isSplit, splitDetail } from "@mybookkeeper/api-client/utils/propertySplit";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import { cn } from "@/shared/utils/cn";
import { LoadingStatus, Skeleton } from "@platform/ui";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import { LIST_LOAD_MODE } from "@/shared/lib/list-load-modes";
import TransactionSkeletonRows from "@/app/features/transactions/TransactionSkeletonRows";

export interface TransactionTableProps {
  table: ReactTable<AppTableFeatures, Transaction>;
  colCount: number;
  onRowClick: (transaction: Transaction) => void;
  editingId: string | null;
  filterOptions?: FilterOptions;
  propertyMap?: ReadonlyMap<string, string>;
  accountMap?: ReadonlyMap<string, string>;
  /** What the body shows. While another page, filter or order loads it holds placeholders, and after that load failed nothing (the page shows the error). */
  mode: ListLoadMode;
  /** Rows are on their way: for the shown page and filters (a refetch), or for others (with `mode` "loading"). */
  isRefreshing?: boolean;
}

export default function TransactionTable({ table, colCount, onRowClick, editingId, filterOptions, propertyMap, accountMap, mode, isRefreshing = false }: TransactionTableProps) {
  const { pageIndex, pageSize } = table.state.pagination;
  // The server pages the rows, so the count is every matching row, not just this page's.
  const totalRows = table.getRowCount();
  const emptyMessage =
    table.state.columnFilters.length === 0
      ? "No transactions yet. Upload a document on the Documents page and I'll extract transactions automatically."
      : "No transactions found";
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalRows);
  const rangeLabel = totalRows > 0 ? `${start}–${end} of ${totalRows}` : "0 results";
  // The header (and its filters) and the footer stay up; only the body waits for the rows.
  const hasRows = mode === LIST_LOAD_MODE.list || mode === LIST_LOAD_MODE.empty;
  const dimsRows = isRefreshing && hasRows;

  return (
    <div
      className="border rounded-lg overflow-hidden md:flex md:flex-col md:min-h-0 md:flex-1"
      aria-busy={isRefreshing}
    >
      {/* Mobile card view */}
      <div className={cn("md:hidden divide-y", dimsRows && "opacity-60")} data-testid="transaction-cards">
        {mode === LIST_LOAD_MODE.loading &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="p-4 space-y-2" data-testid="transaction-card-skeleton">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        {hasRows && table.getRowModel().rows.length === 0 && <EmptyState message={emptyMessage} />}
        {hasRows &&
          table.getRowModel().rows.map((row) => {
            const t = row.original;
            const isActive = editingId === t.id;
            const propertyName = t.property_id ? propertyMap?.get(t.property_id) : null;
            const accountName = accountMap ? transactionAccountLabel(t, accountMap, ACCOUNT_MSG.unknown) : null;
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
                  {t.is_capital_improvement ? <CapitalImprovementBadge /> : null}
                  {isSplit(t) && (
                    <SplitWaysBadge ways={t.property_splits.length} detail={propertyMap ? splitDetail(t.property_splits, propertyMap) : undefined} />
                  )}
                  {!isSplit(t) && propertyName && <span className="text-xs text-muted-foreground">{propertyName}</span>}
                  {accountName && (
                    <span className="text-xs text-muted-foreground" data-testid="transaction-card-account">{accountName}</span>
                  )}
                </div>
              </button>
            );
          })}
      </div>

      {mode === LIST_LOAD_MODE.loading ? <LoadingStatus label="Loading transactions…" /> : null}

      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-muted text-muted-foreground border-b sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  return (
                    <DataTableHeaderCell
                      key={header.id}
                      column={header.column}
                      label={header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    >
                      {header.column.getCanFilter() && filterOptions?.[header.column.id] ? (
                        <ColumnFilter
                          column={header.column}
                          options={filterOptions[header.column.id]}
                        />
                      ) : header.column.id === "transaction_date" && header.column.getCanFilter() ? (
                        <ColumnFilter column={header.column} enableDateRange />
                      ) : null}
                    </DataTableHeaderCell>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className={cn("divide-y", dimsRows && "opacity-60")}>
            {mode === LIST_LOAD_MODE.loading ? <TransactionSkeletonRows /> : null}
            {hasRows && table.getRowModel().rows.map((row) => (
              <Fragment key={row.original.id}>
                <tr
                  className={`hover:bg-muted/50 cursor-pointer ${editingId === row.original.id ? "bg-blue-50 dark:bg-blue-950 border-l-2 border-l-blue-500" : ""} ${row.original.status === "pending" && editingId !== row.original.id ? "bg-yellow-50/40 dark:bg-yellow-950/20" : ""}`}
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("border-b", cell.column.id === "select" ? "p-0" : "px-4 py-3")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
            {mode === LIST_LOAD_MODE.empty && (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState message={emptyMessage} />
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
            aria-label="Rows per page"
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
          {hasRows && <span>{rangeLabel}</span>}
          <div className="flex items-center gap-1">
            <button aria-label="First page" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button aria-label="Last page" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
