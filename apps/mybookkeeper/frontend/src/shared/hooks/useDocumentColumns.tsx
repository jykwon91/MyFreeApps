import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { FileCheck, Trash2 } from "lucide-react";
import { formatDate, timeAgo } from "@/shared/utils/date";
import { DOCUMENT_TYPE_LABELS } from "@/shared/lib/constants";
import type { Document } from "@/shared/types/document/document";
import Button from "@/shared/components/ui/Button";
import StatusBadge from "@/app/features/documents/StatusBadge";
import IndeterminateCheckbox from "@/shared/components/ui/IndeterminateCheckbox";

interface ColumnActions {
  onDelete: (id: string) => void;
  onToggleEscrow?: (id: string, currentValue: boolean) => void;
  canWrite?: boolean;
}

const columnHelper = createColumnHelper<Document>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDocumentColumns(actions: ColumnActions): ColumnDef<Document, any>[] {
  const { onDelete, onToggleEscrow, canWrite = true } = actions;

  return useMemo(
    () => [
      columnHelper.display({
        id: "select",
        enableSorting: false,
        header: ({ table }) => (
          <IndeterminateCheckbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select all documents"
          />
        ),
        cell: ({ row }) => (
          <IndeterminateCheckbox
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${row.original.file_name ?? "document"}`}
          />
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        enableSorting: true,
        cell: ({ getValue, row }) => (
          <div>
            <StatusBadge status={getValue()} errorMessage={row.original.error_message} />
            {row.original.is_escrow_paid && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <FileCheck size={10} />
                Reference
              </span>
            )}
            {getValue() === "failed" && row.original.error_message && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-[240px]">
                {row.original.error_message}
              </p>
            )}
          </div>
        ),
        filterFn: (row, _columnId, filterValue: string[]) => {
          return filterValue.includes(row.getValue<string>("status"));
        },
      }),
      columnHelper.accessor("file_name", {
        header: "File",
        enableSorting: true,
        enableColumnFilter: true,
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.file_name ?? "";
          const b = rowB.original.file_name ?? "";
          return a.localeCompare(b);
        },
        filterFn: "includesString",
        cell: ({ getValue }) => (
          <span className="block" title={getValue() ?? undefined}>
            {getValue() ?? "\u2014"}
          </span>
        ),
      }),
      columnHelper.accessor("document_type", {
        header: "Type",
        enableSorting: true,
        cell: ({ getValue }) => {
          const raw = getValue();
          return (
            <span className="text-muted-foreground">
              {raw ? (DOCUMENT_TYPE_LABELS[raw] ?? raw) : "\u2014"}
            </span>
          );
        },
        filterFn: (row, _columnId, filterValue: string[]) => {
          const val = row.getValue<string | null>("document_type") ?? "";
          return filterValue.includes(val);
        },
      }),
      columnHelper.accessor("source", {
        header: () => <span title="Where this document came from — uploaded by you or imported from Gmail">Source</span>,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-xs px-2 py-0.5 rounded bg-muted">
            {getValue() === "email" ? "Email" : "Upload"}
          </span>
        ),
        filterFn: (row, _columnId, filterValue: string[]) => {
          return filterValue.includes(row.getValue<string>("source"));
        },
      }),
      columnHelper.accessor("created_at", {
        header: "Uploaded",
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.created_at ?? "";
          const b = rowB.original.created_at ?? "";
          return a.localeCompare(b);
        },
        cell: ({ getValue }) => (
          <span className="text-muted-foreground" title={formatDate(getValue())}>
            {timeAgo(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          if (!canWrite) return null;
          return (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {onToggleEscrow && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleEscrow(row.original.id, row.original.is_escrow_paid)}
                  title={row.original.is_escrow_paid ? "Unmark as reference-only" : "Mark as reference-only (escrow-paid)"}
                  className={`p-1.5 ${row.original.is_escrow_paid ? "text-blue-600" : "text-muted-foreground hover:text-blue-600"}`}
                >
                  <FileCheck size={14} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(row.original.id)}
                title="Delete"
                className="p-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          );
        },
      }),
    ],
    [onDelete, onToggleEscrow, canWrite],
  );
}
