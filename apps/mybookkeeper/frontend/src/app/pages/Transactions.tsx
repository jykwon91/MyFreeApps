import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Plus, Upload, Sparkles } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useTransactionColumns } from "@/shared/hooks/useTransactionColumns";
import { useTransactionPageState } from "@/app/features/transactions/hooks/useTransactionPageState";
import { formatTag } from "@/shared/utils/tag";
import TransactionTable from "@/app/features/transactions/TransactionTable";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import ManualEntryForm from "@/app/features/transactions/ManualEntryForm";
import TransactionBulkBar from "@/app/features/transactions/TransactionBulkBar";
import TransactionFilterBar from "@/app/features/transactions/TransactionFilterBar";
import TransactionsSkeleton from "@/app/features/transactions/TransactionsSkeleton";
import BankStatementImport from "@/app/features/transactions/BankStatementImport";
import ClassificationRulesPanel from "@/app/features/transactions/ClassificationRulesPanel";
import ExportDropdown from "@/app/features/transactions/ExportDropdown";
import DuplicateTab from "@/app/features/transactions/DuplicateTab";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import Button from "@/shared/components/ui/Button";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import { useToast } from "@/shared/hooks/useToast";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

export default function Transactions() {
  const { showError, showSuccess } = useToast();
  const canWrite = useCanWrite();

  const {
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    transactions,
    isLoading,
    bulkAction,
    confirmBulkDelete,
    setConfirmBulkDelete,
    busyId,
    confirmDeleteId,
    setConfirmDeleteId,
    editingTransaction,
    setEditingTransaction,
    showManualEntry,
    setShowManualEntry,
    showBankImport,
    setShowBankImport,
    showClassificationRules,
    setShowClassificationRules,
    properties,
    propertyMap,
    duplicatePairs,
    isDuplicatesLoading,
    dupCount,
    handleApprove,
    handleDelete,
    handleConfirmDelete,
    handleBulkApprove,
    executeBulkDelete,
    handleExportCSV,
    handleExportPDF,
    handleVendorLearned,
    handleKeepDuplicate,
    handleDismissDuplicate,
    handleMergeDuplicate,
  } = useTransactionPageState();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([{ id: "transaction_date", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const columnVisibility: VisibilityState = useMemo(() => ({}), []);

  // Build set of transaction IDs that belong to duplicate pairs for inline indicators
  const duplicateIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const pair of duplicatePairs) {
      ids.add(pair.transaction_a.id);
      ids.add(pair.transaction_b.id);
    }
    return ids;
  }, [duplicatePairs]);

  const columns = useTransactionColumns(propertyMap, {
    onDelete: handleDelete,
    onApprove: handleApprove,
    busyId,
    duplicateIds: duplicateIdSet,
    canWrite,
  });

  const filterOptions = useMemo(
    () => ({
      status: [
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "needs_review", label: "Needs Review" },
        { value: "duplicate", label: "Duplicate" },
      ],
      transaction_type: [
        { value: "income", label: "Income" },
        { value: "expense", label: "Expense" },
      ],
      category: [...new Set(transactions.map((t) => t.category))].sort().map((c) => ({
        value: c,
        label: formatTag(c),
      })),
      property_id: [
        { value: "__empty__", label: "(No property)" },
        ...properties.map((p) => ({ value: p.id, label: p.name })),
      ],
      tax_relevant: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    }),
    [transactions, properties],
  );

  const table = useReactTable({
    data: transactions,
    columns,
    state: { rowSelection, sorting, columnVisibility, columnFilters },
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
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const hasApprovable = selectedRows.some(
    (r) =>
      r.original.property_id &&
      (r.original.status === "pending" || r.original.status === "needs_review"),
  );

  const deleteTarget = confirmDeleteId ? transactions.find((t) => t.id === confirmDeleteId) : null;

  return (
    <main className="p-4 sm:p-8 space-y-4 md:h-screen md:flex md:flex-col md:overflow-hidden">
      <SectionHeader
        title="Transactions"
        actions={
          activeTab === "transactions" ? (
            <>
              {canWrite && (
                <Button size="sm" variant="secondary" onClick={() => setShowClassificationRules(true)}>
                  <Sparkles size={14} className="mr-1.5" />
                  Vendor Rules
                </Button>
              )}
              {canWrite && (
                <Button size="sm" variant="secondary" onClick={() => setShowBankImport(true)}>
                  <Upload size={14} className="mr-1.5" />
                  Import
                </Button>
              )}
              <ExportDropdown onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
              {canWrite ? (
                <Button size="sm" onClick={() => setShowManualEntry(true)}>
                  <Plus size={14} className="mr-1.5" />
                  Add Transaction
                </Button>
              ) : (
                <Button size="sm" disabled title="You have read-only access">
                  <Plus size={14} className="mr-1.5" />
                  Add Transaction
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b -mb-2">
        <button
          onClick={() => setActiveTab("transactions")}
          disabled={isLoading || isDuplicatesLoading}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors min-h-[44px]",
            activeTab === "transactions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            (isLoading || isDuplicatesLoading) && "opacity-50 cursor-not-allowed",
          )}
        >
          Transactions
        </button>
        <button
          onClick={() => setActiveTab("duplicates")}
          disabled={isLoading || isDuplicatesLoading}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors min-h-[44px] flex items-center gap-2",
            activeTab === "duplicates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            (isLoading || isDuplicatesLoading) && "opacity-50 cursor-not-allowed",
          )}
        >
          Duplicates
          {dupCount !== null && dupCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
              {dupCount}
            </span>
          )}
        </button>
      </div>

      {/* Transactions tab content */}
      {activeTab === "transactions" && (
        <>
          <TransactionFilterBar filters={filters} onChange={setFilters} properties={properties} />

          {selectedCount > 0 && canWrite && (
            <TransactionBulkBar
              selectedCount={selectedCount}
              hasApprovable={hasApprovable}
              isApproving={bulkAction === "approve"}
              isDeleting={bulkAction === "delete"}
              onApprove={() =>
                handleBulkApprove(
                  selectedRows
                    .filter(
                      (r) =>
                        r.original.property_id &&
                        (r.original.status === "pending" || r.original.status === "needs_review"),
                    )
                    .map((r) => r.original.id),
                )
              }
              onDelete={() => setConfirmBulkDelete(true)}
              onClearSelection={() => setRowSelection({})}
            />
          )}

          {isLoading ? (
            <TransactionsSkeleton />
          ) : (
            <TransactionTable
              table={table}
              colCount={colCount}
              onRowClick={setEditingTransaction}
              editingId={editingTransaction?.id ?? null}
              filterOptions={filterOptions}
              propertyMap={propertyMap}
            />
          )}
        </>
      )}

      {/* Duplicates tab content */}
      {activeTab === "duplicates" && (
        <div className="space-y-4 pb-4 md:flex-1 md:overflow-auto md:min-h-0">
          <DuplicateTab
            duplicatePairs={duplicatePairs}
            isLoading={isDuplicatesLoading}
            propertyMap={propertyMap}
            onMerge={handleMergeDuplicate}
            onDismiss={handleDismissDuplicate}
          />
        </div>
      )}

      {editingTransaction && (
        <TransactionPanel
          key={editingTransaction.id}
          transaction={editingTransaction}
          properties={properties}
          onClose={() => setEditingTransaction(null)}
          onVendorLearned={handleVendorLearned}
          duplicatePair={duplicatePairs.find(
            (p) => p.transaction_a.id === editingTransaction.id || p.transaction_b.id === editingTransaction.id
          )}
          onKeepDuplicate={handleKeepDuplicate}
          onDismissDuplicate={handleDismissDuplicate}
        />
      )}

      {showManualEntry && (
        <ManualEntryForm
          properties={properties}
          onClose={() => setShowManualEntry(false)}
          onSuccess={() => {
            setShowManualEntry(false);
            showSuccess("Transaction created");
          }}
          onError={showError}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete transaction"
        description={`Are you sure you want to delete ${deleteTarget?.vendor ?? "this transaction"}? This action cannot be undone.`}
        confirmLabel={busyId === confirmDeleteId ? "Deleting..." : "Delete"}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete transactions"
        description={`Are you sure you want to delete ${selectedCount} transaction(s)? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => executeBulkDelete(selectedRows.map((r) => r.original.id))}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {showClassificationRules ? <ClassificationRulesPanel onClose={() => setShowClassificationRules(false)} /> : null}

      {showBankImport ? (
        <BankStatementImport
          properties={properties}
          onClose={() => setShowBankImport(false)}
          onSuccess={(msg) => {
            setShowBankImport(false);
            showSuccess(msg);
          }}
          onError={showError}
        />
      ) : null}
    </main>
  );
}
