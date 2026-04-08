import { useCallback, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import {
  useGetDocumentsQuery,
  useBulkDeleteDocumentsMutation,
  useDeleteDocumentMutation,
  useToggleEscrowPaidMutation,
} from "@/shared/store/documentsApi";
import { useDocumentColumns } from "@/shared/hooks/useDocumentColumns";
import { useToast } from "@/shared/hooks/useToast";
import { useAppSelector } from "@/shared/store/hooks";
import { TYPE_OPTIONS, STATUS_OPTIONS, SOURCE_OPTIONS } from "@/shared/lib/document-config";
import DocumentUploadZone from "@/app/features/documents/DocumentUploadZone";
import DocumentsSkeleton from "@/app/features/documents/DocumentsSkeleton";
import DocumentTable from "@/app/features/documents/DocumentTable";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import Button from "@/shared/components/ui/Button";
import AlertBox from "@/shared/components/ui/AlertBox";
import { useDismissable } from "@/shared/hooks/useDismissable";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

export default function Documents() {
  const { showError, showSuccess } = useToast();
  const canWrite = useCanWrite();
  const uploadStatus = useAppSelector((s) => s.documentUpload.current?.status);
  const isExtracting = uploadStatus === "processing";

  const { data: documents = [], isLoading } = useGetDocumentsQuery(
    { excludeProcessing: true },
    { pollingInterval: isExtracting ? 5000 : 0 },
  );

  const [deleteDocument, { isLoading: isDeleting }] = useDeleteDocumentMutation();
  const [bulkDelete, { isLoading: isBulkDeleting }] = useBulkDeleteDocumentsMutation();
  const [toggleEscrow, { isLoading: isTogglingEscrow }] = useToggleEscrowPaidMutation();

  const [failedDismissed, setFailedDismissed] = useState(false);
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("docs-info-dismissed");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmEscrowId, setConfirmEscrowId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteDocument(confirmDeleteId).unwrap();
    } catch {
      showError("Failed to delete document");
    } finally {
      setConfirmDeleteId(null);
    }
  }

  async function handleBulkDelete() {
    setConfirmBulkDelete(false);
    const ids = table.getSelectedRowModel().rows.map((r) => r.original.id);
    try {
      await bulkDelete(ids).unwrap();
      setRowSelection({});
    } catch {
      showError("Failed to delete documents");
    }
  }

  const handleToggleEscrow = useCallback((id: string, currentValue: boolean) => {
    if (!currentValue) {
      // Enabling escrow-paid — confirm since it deletes transactions
      setConfirmEscrowId(id);
    } else {
      // Disabling escrow-paid — no confirmation needed
      toggleEscrow({ id, is_escrow_paid: false })
        .unwrap()
        .then(() => showSuccess("Document unmarked as reference-only"))
        .catch(() => showError("Failed to update document"));
    }
  }, [toggleEscrow, showSuccess, showError]);

  async function handleConfirmEscrow() {
    if (!confirmEscrowId) return;
    try {
      const result = await toggleEscrow({ id: confirmEscrowId, is_escrow_paid: true }).unwrap();
      const count = result.transactions_removed;
      showSuccess(
        count > 0
          ? `Marked as reference-only — removed ${count} transaction${count > 1 ? "s" : ""}`
          : "Marked as reference-only"
      );
    } catch {
      showError("Failed to update document");
    } finally {
      setConfirmEscrowId(null);
    }
  }

  const columns = useDocumentColumns({ onDelete: handleDelete, onToggleEscrow: handleToggleEscrow, canWrite });

  const filterOptions = useMemo(
    () => ({
      status: STATUS_OPTIONS,
      document_type: TYPE_OPTIONS,
      source: SOURCE_OPTIONS,
    }),
    [],
  );

  const table = useReactTable({
    data: documents,
    columns,
    state: { rowSelection, sorting, columnFilters },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const colCount = table.getAllLeafColumns().length;
  const selectedCount = table.getSelectedRowModel().rows.length;
  const deleteTarget = confirmDeleteId
    ? documents.find((d) => d.id === confirmDeleteId)
    : null;
  const failedDocs = documents.filter((d) => d.status === "failed");

  return (
    <main className="p-4 sm:p-8 space-y-4 md:h-screen md:flex md:flex-col md:overflow-hidden">
      <SectionHeader title="Documents" />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-start justify-between gap-3">
          <div className="text-sm space-y-1">
            <p className="font-medium">Upload your financial documents and I'll extract the data automatically.</p>
            <p className="text-muted-foreground">
              I can read <strong>invoices</strong>, <strong>receipts</strong>, <strong>utility bills</strong>, <strong>bank statements</strong>, <strong>1099s</strong>, <strong>W-2s</strong>, <strong>1098s</strong>, and other tax forms.
              Supported formats: <strong>PDF</strong>, <strong>images</strong> (PNG, JPG), <strong>Word docs</strong>, and <strong>spreadsheets</strong> (XLSX, CSV).
            </p>
          </div>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      {canWrite ? <DocumentUploadZone /> : null}

      {failedDocs.length > 0 && !failedDismissed && (
        <AlertBox variant="warning" className="flex items-center justify-between gap-3">
          <span>
            {failedDocs.length === 1
              ? `I had trouble with ${failedDocs[0].file_name}. Want me to try again?`
              : `I had trouble with ${failedDocs.length} documents — want to take a look?`}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-orange-800 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900 h-7 px-2"
              onClick={() => setColumnFilters([{ id: "status", value: ["failed"] }])}
            >
              Show failed
            </Button>
            <button
              onClick={() => setFailedDismissed(true)}
              aria-label="Dismiss"
              className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900 text-orange-800 dark:text-orange-200"
            >
              <X size={14} />
            </button>
          </div>
        </AlertBox>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            table.getColumn("file_name")?.setFilterValue(e.target.value || undefined);
          }}
          placeholder="Search by file name..."
          className="w-full border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {selectedCount > 0 && canWrite && (
        <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setConfirmBulkDelete(true)}>
            Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      )}

      {isLoading ? (
        <DocumentsSkeleton />
      ) : (
        <DocumentTable
          table={table}
          colCount={colCount}
          filterOptions={filterOptions}
          onRowClick={(doc) => setViewingDocId(doc.id)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete document"
        description={`Are you sure you want to delete ${deleteTarget?.file_name ?? "this document"}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete documents"
        description={`Are you sure you want to delete ${selectedCount} document(s)? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isBulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <ConfirmDialog
        open={!!confirmEscrowId}
        title="Mark as reference-only"
        description="This document was paid through escrow (e.g., insurance, property taxes). Any transactions created from this document will be removed."
        confirmLabel="Mark as reference-only"
        isLoading={isTogglingEscrow}
        onConfirm={handleConfirmEscrow}
        onCancel={() => setConfirmEscrowId(null)}
      />
      {viewingDocId && (
        <DocumentViewer
          documentId={viewingDocId}
          onClose={() => setViewingDocId(null)}
        />
      )}
    </main>
  );
}
