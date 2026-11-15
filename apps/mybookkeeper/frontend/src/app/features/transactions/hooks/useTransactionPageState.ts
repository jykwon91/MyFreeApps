import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  functionalUpdate,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import {
  useGetTransactionPageQuery,
  useListTransactionCategoriesQuery,
  useBulkApproveTransactionsMutation,
  useBulkDeleteTransactionsMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
  useGetDuplicatesQuery,
  useKeepDuplicateMutation,
  useDismissDuplicateMutation,
  useMergeDuplicatesMutation,
} from "@mybookkeeper/api-client/store/transactionsApi";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { useToast } from "@/shared/hooks/useToast";
import { EMPTY_FILTERS, INITIAL_TRANSACTION_PAGINATION } from "@/shared/lib/transaction-config";
import { DEFAULT_TRANSACTION_SORTING } from "@/shared/lib/transaction-sort-columns";
import { toFilterBarParams, toTransactionListParams } from "@/shared/utils/transaction-list-params";
import { clampPage } from "@/shared/utils/clamp-page";
import { useTransactionSelection } from "@/app/features/transactions/hooks/useTransactionSelection";
import { useRefetchCount } from "@/app/features/transactions/hooks/useRefetchCount";
import type { TransactionSelection } from "@/shared/types/transaction/transaction-selection";
import { bulkApproveMessage, bulkDeleteMessage } from "@mybookkeeper/api-client/utils/bulkTransactionMessages";
import { downloadFile } from "@/shared/utils/download";
import { formatTag } from "@/shared/utils/tag";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { Tab } from "@/shared/types/transaction/transaction-tab";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import { runBulkCounts } from "@mybookkeeper/api-client/utils/runBulkCounts";
import { transactionExportPath } from "@mybookkeeper/api-client/utils/transactionExportPath";
import { transactionListQuery } from "@mybookkeeper/api-client/utils/transactionListQuery";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";

export interface TransactionPageState {
  // Tab
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  // Filters, order and the page of transactions shown. Each is applied by the server.
  filters: Filters;
  setFilters: (filters: Filters) => void;
  columnFilters: ColumnFiltersState;
  setColumnFilters: OnChangeFn<ColumnFiltersState>;
  sorting: SortingState;
  setSorting: OnChangeFn<SortingState>;
  pagination: PaginationState;
  setPagination: OnChangeFn<PaginationState>;
  transactions: Transaction[];
  /** How many rows the filters match across every page. */
  total: number;
  pageCount: number;
  categories: string[];
  isLoading: boolean;
  /** True while another page, filter or order is on its way (the shown rows are the previous ones). */
  isFetching: boolean;
  queryParams: TransactionListParams;
  selection: TransactionSelection;

  // Bulk selection UI state
  bulkAction: "approve" | "delete" | null;
  confirmBulkDelete: boolean;
  setConfirmBulkDelete: (open: boolean) => void;

  // Row actions
  busyId: string | null;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  editingTransaction: Transaction | null;
  setEditingTransaction: (t: Transaction | null) => void;

  // Panel visibility
  showManualEntry: boolean;
  setShowManualEntry: (show: boolean) => void;
  showBankImport: boolean;
  setShowBankImport: (show: boolean) => void;
  showClassificationRules: boolean;
  setShowClassificationRules: (show: boolean) => void;

  // Properties
  properties: Property[];
  propertyMap: Map<string, string>;

  // Duplicates
  duplicatePairs: DuplicatePair[];
  isDuplicatesLoading: boolean;
  dupCount: number | null;

  // Handlers
  handleApprove: (id: string) => Promise<void>;
  handleDelete: (id: string) => void;
  handleConfirmDelete: () => Promise<void>;
  handleBulkApprove: (ids: string[]) => Promise<void>;
  executeBulkDelete: (ids: string[]) => Promise<void>;
  handleExportCSV: () => Promise<void>;
  handleExportPDF: () => Promise<void>;
  handleVendorLearned: (vendor: string, category: string, retroactiveCount: number) => void;
  handleKeepDuplicate: (keepId: string, deleteIds: string[]) => Promise<void>;
  handleDismissDuplicate: (ids: string[]) => Promise<void>;
  handleMergeDuplicate: (
    transactionAId: string,
    transactionBId: string,
    survivingId: string,
    fieldOverrides: Record<string, MergeFieldSide>,
  ) => Promise<void>;
}

export function useTransactionPageState(): TransactionPageState {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) || "transactions";
  const setActiveTab = useCallback(
    (tab: Tab) => {
      setSearchParams(tab === "transactions" ? {} : { tab });
    },
    [setSearchParams],
  );

  const { showError, showSuccess } = useToast();

  const [filters, setFilterBar] = useState<Filters>(EMPTY_FILTERS);
  const [columnFilters, setColumnFilterState] = useState<ColumnFiltersState>([]);
  const [sorting, setSortingState] = useState<SortingState>(DEFAULT_TRANSACTION_SORTING);
  const [storedPagination, setStoredPagination] = useState<PaginationState>(INITIAL_TRANSACTION_PAGINATION);
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkAction, setBulkAction] = useState<"approve" | "delete" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showBankImport, setShowBankImport] = useState(false);
  const [showClassificationRules, setShowClassificationRules] = useState(false);

  const { data: properties = [] } = useGetPropertiesQuery();
  const { data: duplicateData, isLoading: isDuplicatesLoading } = useGetDuplicatesQuery(undefined, {
    skip: activeTab !== "duplicates",
  });
  const [keepDuplicate] = useKeepDuplicateMutation();
  const [dismissDuplicate] = useDismissDuplicateMutation();
  const [mergeDuplicates] = useMergeDuplicatesMutation();

  const duplicatePairs = duplicateData?.pairs ?? [];
  const dupCount = isDuplicatesLoading ? null : duplicatePairs.length;

  // A new filter or order starts again from the first page, as the table did when it held every row.
  const toFirstPage = useCallback(() => setStoredPagination((current) => ({ ...current, pageIndex: 0 })), []);
  const setFilters = useCallback(
    (next: Filters) => {
      setFilterBar(next);
      toFirstPage();
    },
    [toFirstPage],
  );
  const setColumnFilters = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      setColumnFilterState(updater);
      toFirstPage();
    },
    [toFirstPage],
  );
  const setSorting = useCallback(
    (updater: Updater<SortingState>) => {
      setSortingState(updater);
      toFirstPage();
    },
    [toFirstPage],
  );

  const queryParams = useMemo(
    () => toTransactionListParams(filters, columnFilters, sorting),
    [filters, columnFilters, sorting],
  );
  const filterBarParams = useMemo(() => toFilterBarParams(filters), [filters]);
  const skip = activeTab !== "transactions";

  // Deleting the last rows of the last page would leave it past the end; show the new last page instead.
  const pagination = useMemo(
    () => clampPage(storedPagination, knownTotal),
    [storedPagination, knownTotal],
  );
  const setPagination = useCallback(
    (updater: Updater<PaginationState>) =>
      setStoredPagination((current) => functionalUpdate(updater, clampPage(current, knownTotal))),
    [knownTotal],
  );
  const pageArgs = useMemo(
    () => ({ ...queryParams, limit: pagination.pageSize, offset: pagination.pageIndex * pagination.pageSize }),
    [queryParams, pagination],
  );
  const { data: page, currentData, fulfilledTimeStamp, isLoading, isFetching } = useGetTransactionPageQuery(pageArgs, { skip });
  // Bumped when an edit (or coming back to the tab) refetches the same page, so the ticks are
  // checked again: the edit may have moved ticked rows out of the filters, or deleted them.
  const rowsVersion = useRefetchCount(
    `${transactionListQuery(pageArgs)}&offset=${pageArgs.offset}`,
    currentData ? fulfilledTimeStamp : undefined,
  );
  const { data: categories = [] } = useListTransactionCategoriesQuery(filterBarParams, { skip });
  const transactions = useMemo(() => page?.items ?? [], [page]);
  const total = page?.total ?? 0;
  // Kept in state because the page asked for depends on it; React re-renders straight away.
  if (page && page.total !== knownTotal) setKnownTotal(page.total);
  const pageCount = Math.ceil(total / pagination.pageSize);

  const rowsStatus = useMemo(
    () => ({ isCurrent: !isFetching, isRefetching: isFetching && currentData !== undefined, version: rowsVersion }),
    [isFetching, currentData, rowsVersion],
  );
  const selection = useTransactionSelection(transactions, queryParams, total, rowsStatus);
  const { remove: removeFromSelection } = selection;

  const [deleteTransaction] = useDeleteTransactionMutation();
  const [updateTransaction] = useUpdateTransactionMutation();
  const [bulkApprove] = useBulkApproveTransactionsMutation();
  const [bulkDelete] = useBulkDeleteTransactionsMutation();

  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p.name])),
    [properties],
  );

  const handleApprove = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await updateTransaction({ id, data: { status: "approved" } as Partial<Transaction> }).unwrap();
        showSuccess("Transaction approved");
      } catch {
        showError("Failed to approve transaction");
      } finally {
        setBusyId(null);
      }
    },
    [updateTransaction, showSuccess, showError],
  );

  const handleDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    setBusyId(confirmDeleteId);
    try {
      await deleteTransaction(confirmDeleteId).unwrap();
      removeFromSelection([confirmDeleteId]);
      showSuccess("Transaction deleted");
      if (editingTransaction?.id === confirmDeleteId) setEditingTransaction(null);
    } catch {
      showError("Failed to delete transaction");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, deleteTransaction, removeFromSelection, editingTransaction, showSuccess, showError]);

  const handleBulkApprove = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      setBulkAction("approve");
      try {
        const run = await runBulkCounts(ids, ["approved", "skipped"], (batch) => bulkApprove(batch).unwrap());
        // Approved rows are unticked, as deleted ones are: under a status filter they have just left it.
        const failed = new Set(run.failedIds);
        removeFromSelection(ids.filter((id) => !failed.has(id)));
        const { text, isError } = bulkApproveMessage(run);
        (isError ? showError : showSuccess)(text);
      } finally {
        setBulkAction(null);
      }
    },
    [bulkApprove, removeFromSelection, showSuccess, showError],
  );

  const executeBulkDelete = useCallback(
    async (ids: string[]) => {
      setConfirmBulkDelete(false);
      setBulkAction("delete");
      try {
        const run = await runBulkCounts(ids, ["deleted", "skipped"], (batch) => bulkDelete(batch).unwrap());
        const failed = new Set(run.failedIds);
        removeFromSelection(ids.filter((id) => !failed.has(id)));
        const { text, isError } = bulkDeleteMessage(run);
        (isError ? showError : showSuccess)(text);
      } finally {
        setBulkAction(null);
      }
    },
    [bulkDelete, removeFromSelection, showSuccess, showError],
  );

  const handleExportCSV = useCallback(async () => {
    try {
      await downloadFile(transactionExportPath("csv", queryParams), "transactions.csv");
    } catch {
      showError("Failed to export CSV");
    }
  }, [queryParams, showError]);

  const handleExportPDF = useCallback(async () => {
    try {
      await downloadFile(transactionExportPath("pdf", queryParams), "transactions.pdf");
    } catch {
      showError("Failed to export PDF");
    }
  }, [queryParams, showError]);

  const handleVendorLearned = useCallback(
    (vendor: string, category: string, retroactiveCount: number) => {
      const formatted = formatTag(category);
      if (retroactiveCount > 0) {
        showSuccess(
          `Got it! I'll categorize future transactions from ${vendor} as ${formatted}. Also updated ${retroactiveCount} other transaction${retroactiveCount === 1 ? "" : "s"}.`,
        );
      } else {
        showSuccess(`Got it! I'll categorize future transactions from ${vendor} as ${formatted}.`);
      }
    },
    [showSuccess],
  );

  const handleKeepDuplicate = useCallback(
    async (keepId: string, deleteIds: string[]) => {
      try {
        const result = await keepDuplicate({ keep_id: keepId, delete_ids: deleteIds }).unwrap();
        showSuccess(`Kept 1 transaction, removed ${result.deleted}`);
      } catch {
        showError("Failed to resolve duplicate");
      }
    },
    [keepDuplicate, showSuccess, showError],
  );

  const handleDismissDuplicate = useCallback(
    async (ids: string[]) => {
      try {
        await dismissDuplicate({ transaction_ids: ids }).unwrap();
        showSuccess("Marked as not duplicates");
      } catch {
        showError("Failed to dismiss duplicate");
      }
    },
    [dismissDuplicate, showSuccess, showError],
  );

  const handleMergeDuplicate = useCallback(
    async (
      transactionAId: string,
      transactionBId: string,
      survivingId: string,
      fieldOverrides: Record<string, MergeFieldSide>,
    ) => {
      try {
        await mergeDuplicates({
          transaction_a_id: transactionAId,
          transaction_b_id: transactionBId,
          surviving_id: survivingId,
          field_overrides: fieldOverrides,
        }).unwrap();
        showSuccess("Transactions merged successfully");
      } catch {
        showError("Failed to merge transactions");
      }
    },
    [mergeDuplicates, showSuccess, showError],
  );

  return {
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    columnFilters,
    setColumnFilters,
    sorting,
    setSorting,
    pagination,
    setPagination,
    transactions,
    total,
    pageCount,
    categories,
    isLoading,
    isFetching,
    queryParams,
    selection,
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
  };
}
