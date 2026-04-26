import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useListTransactionsQuery,
  useBulkApproveTransactionsMutation,
  useBulkDeleteTransactionsMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
  useGetDuplicatesQuery,
  useKeepDuplicateMutation,
  useDismissDuplicateMutation,
  useMergeDuplicatesMutation,
} from "@/shared/store/transactionsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import type { Property } from "@/shared/types/property/property";
import { useToast } from "@/shared/hooks/useToast";
import { EMPTY_FILTERS } from "@/shared/lib/transaction-config";
import { downloadFile } from "@/shared/utils/download";
import { formatTag } from "@/shared/utils/tag";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { TransactionListParams } from "@/shared/store/transactionsApi";
import type { Tab } from "@/shared/types/transaction/transaction-tab";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import type { DuplicatePair, MergeFieldSide } from "@/shared/types/transaction/duplicate";

export interface TransactionPageState {
  // Tab
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  // Filters & transactions
  filters: Filters;
  setFilters: (filters: Filters) => void;
  transactions: Transaction[];
  isLoading: boolean;
  queryParams: TransactionListParams;

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

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
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

  const queryParams = useMemo<TransactionListParams>(() => {
    const params: TransactionListParams = {};
    if (filters.property_id) params.property_id = filters.property_id;
    if (filters.status) params.status = filters.status;
    if (filters.transaction_type) params.transaction_type = filters.transaction_type;
    if (filters.category) params.category = filters.category;
    if (filters.vendor) params.vendor = filters.vendor;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    return params;
  }, [filters]);

  const { data: transactions = [], isLoading } = useListTransactionsQuery(queryParams, {
    skip: activeTab !== "transactions",
  });

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
      showSuccess("Transaction deleted");
      if (editingTransaction?.id === confirmDeleteId) setEditingTransaction(null);
    } catch {
      showError("Failed to delete transaction");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, deleteTransaction, editingTransaction, showSuccess, showError]);

  const handleBulkApprove = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      setBulkAction("approve");
      try {
        const result = await bulkApprove(ids).unwrap();
        showSuccess(
          `${result.approved} approved${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}`,
        );
      } catch {
        showError("Failed to approve transactions");
      } finally {
        setBulkAction(null);
      }
    },
    [bulkApprove, showSuccess, showError],
  );

  const executeBulkDelete = useCallback(
    async (ids: string[]) => {
      setConfirmBulkDelete(false);
      setBulkAction("delete");
      try {
        const result = await bulkDelete(ids).unwrap();
        showSuccess(`${result.deleted} transaction(s) deleted`);
      } catch {
        showError("Failed to delete transactions");
      } finally {
        setBulkAction(null);
      }
    },
    [bulkDelete, showSuccess, showError],
  );

  const buildExportParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.property_id) params.set("property_id", filters.property_id);
    if (filters.status) params.set("status", filters.status);
    if (filters.transaction_type) params.set("transaction_type", filters.transaction_type);
    if (filters.category) params.set("category", filters.category);
    if (filters.vendor) params.set("vendor", filters.vendor);
    if (filters.start_date) params.set("start_date", filters.start_date);
    if (filters.end_date) params.set("end_date", filters.end_date);
    return params.toString();
  }, [filters]);

  const handleExportCSV = useCallback(async () => {
    try {
      const qs = buildExportParams();
      await downloadFile(`/exports/transactions/csv${qs ? `?${qs}` : ""}`, "transactions.csv");
    } catch {
      showError("Failed to export CSV");
    }
  }, [buildExportParams, showError]);

  const handleExportPDF = useCallback(async () => {
    try {
      const qs = buildExportParams();
      await downloadFile(`/exports/transactions/pdf${qs ? `?${qs}` : ""}`, "transactions.pdf");
    } catch {
      showError("Failed to export PDF");
    }
  }, [buildExportParams, showError]);

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
    transactions,
    isLoading,
    queryParams,
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
