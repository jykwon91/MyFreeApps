import { Fragment } from "react";
import { flexRender, type ReactTable } from "@tanstack/react-table";
import type { AppTableFeatures } from "@/shared/lib/table-features";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { DOCUMENT_TYPE_LABELS } from "@/shared/lib/constants";
import EmptyState from "@/shared/components/ui/EmptyState";
import { SortIndicator, ColumnFilter } from "@/shared/components/table";
import StatusBadge from "@/app/features/documents/StatusBadge";
import DocumentRowActions from "@/app/features/documents/DocumentRowActions";
import { timeSince } from "@platform/core/utils/timeSince";
import { cn } from "@/shared/utils/cn";
import { formatCount } from "@/shared/utils/count";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";

interface FilterOptions {
  [columnId: string]: { value: string; label: string }[];
}

export interface DocumentTableProps {
  table: ReactTable<AppTableFeatures, Document>;
  colCount: number;
  filterOptions: FilterOptions;
  onRowClick?: (doc: Document) => void;
  onDelete?: (id: string) => void;
  onToggleEscrow?: (id: string, currentValue: boolean) => void;
  onReExtract?: (id: string) => void;
  reExtractingId?: string | null;
  canWrite?: boolean;
  /** How many documents match across every page; the table holds the ones loaded so far. */
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export default function DocumentTable({
  table,
  colCount,
  filterOptions,
  onRowClick,
  onDelete,
  onToggleEscrow,
  onReExtract,
  reExtractingId,
  canWrite = true,
  total,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: DocumentTableProps) {
  const shown = table.getRowModel().rows.length;

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
              <div key={doc.id} className="p-4 hover:bg-muted/50">
                <button
                  onClick={() => onRowClick?.(doc)}
                  className={cn(
                    "w-full text-left min-h-[44px]",
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
                      {timeSince(doc.created_at)}
                    </span>
                  </div>
                </button>
                {canWrite && onDelete && (
                  <div className="mt-2 flex justify-end border-t pt-2">
                    <DocumentRowActions
                      doc={doc}
                      onDelete={onDelete}
                      onToggleEscrow={onToggleEscrow}
                      onReExtract={onReExtract}
                      reExtractingId={reExtractingId}
                      canWrite={canWrite}
                      comfortable
                    />
                  </div>
                )}
              </div>
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30 text-sm text-muted-foreground shrink-0">
        <span data-testid="documents-shown-count">
          {shown === total ? formatCount(total, "document") : `${shown} of ${formatCount(total, "document")}`}
        </span>
        <LoadMoreButton hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} />
      </div>
    </div>
  );
}
