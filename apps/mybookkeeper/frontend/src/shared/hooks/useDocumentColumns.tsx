import { documentSourceLabel } from "@mybookkeeper/api-client/utils/documentSourceLabel";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { type AppTableFeatures } from "@/shared/lib/table-features";
import { FileCheck, Loader2 } from "lucide-react";
import { timeSince } from "@platform/core/utils/timeSince";
import { formatDate } from "@/shared/utils/date";
import { DOCUMENT_TYPE_LABELS } from "@/shared/lib/constants";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import StatusBadge from "@/app/features/documents/StatusBadge";
import DocumentRowActions from "@/app/features/documents/DocumentRowActions";
import IndeterminateCheckbox from "@/shared/components/ui/IndeterminateCheckbox";
import RowPrimaryAction from "@/shared/components/ui/RowPrimaryAction";
import { SELECTING_ALL_DOCUMENTS_LABEL } from "@/shared/lib/document-list-messages";
import type { SelectAllControl } from "@/shared/types/select-all-control";

interface ColumnActions {
  /** Opens a document; its file name is the button that does it. */
  onOpen: (doc: Document) => void;
  onDelete: (id: string) => void;
  onToggleEscrow?: (id: string, currentValue: boolean) => void;
  onReExtract?: (id: string) => void;
  reExtractingId?: string | null;
  canWrite?: boolean;
  /** Ticks every document the filters match, loaded or not. */
  selectAll: SelectAllControl;
}

const columnHelper = createColumnHelper<AppTableFeatures, Document>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDocumentColumns(actions: ColumnActions): ColumnDef<AppTableFeatures, Document, any>[] {
  const { onOpen, onDelete, onToggleEscrow, onReExtract, reExtractingId, canWrite = true, selectAll } = actions;

  return useMemo(
    () => [
      columnHelper.display({
        id: "select",
        enableSorting: false,
        header: () =>
          selectAll.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" role="status" aria-label={SELECTING_ALL_DOCUMENTS_LABEL} />
          ) : (
            <IndeterminateCheckbox
              checked={selectAll.checked}
              indeterminate={selectAll.indeterminate}
              onChange={selectAll.onToggle}
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
      }),
      columnHelper.accessor("file_name", {
        header: "File",
        enableSorting: true,
        enableColumnFilter: true,
        cell: ({ getValue, row }) => (
          <RowPrimaryAction
            onActivate={() => onOpen(row.original)}
            aria-label={`Open ${getValue() ?? "document"}`}
            className="block"
          >
            <span title={getValue() ?? undefined}>{getValue() ?? "\u2014"}</span>
          </RowPrimaryAction>
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
      }),
      columnHelper.accessor("source", {
        header: () => <span title="Where this document came from — uploaded by you or imported from Gmail">Source</span>,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-xs px-2 py-0.5 rounded bg-muted">
            {documentSourceLabel(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("created_at", {
        header: "Uploaded",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground" title={formatDate(getValue())}>
            {timeSince(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <DocumentRowActions
            doc={row.original}
            onDelete={onDelete}
            onToggleEscrow={onToggleEscrow}
            onReExtract={onReExtract}
            reExtractingId={reExtractingId}
            canWrite={canWrite}
          />
        ),
      }),
    ],
    [onOpen, onDelete, onToggleEscrow, onReExtract, reExtractingId, canWrite, selectAll],
  );
}
