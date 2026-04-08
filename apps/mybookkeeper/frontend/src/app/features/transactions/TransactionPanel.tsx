import { useState, useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X, FileText, Copy, Check, XCircle, Trash2 } from "lucide-react";
import api from "@/shared/lib/api";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES, PAYMENT_METHODS, CHANNELS } from "@/shared/lib/constants";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { Property } from "@/shared/types/property/property";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import type { DuplicatePair } from "@/shared/types/transaction/duplicate";
import Panel from "@/shared/components/ui/Panel";
import FormField from "@/shared/components/ui/FormField";
import Select from "@/shared/components/ui/Select";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import TransactionStatusBadge from "@/app/features/transactions/TransactionStatusBadge";
import TransactionTypeBadge from "@/app/features/transactions/TransactionTypeBadge";
import { useUpdateTransactionMutation, useDeleteTransactionMutation } from "@/shared/store/transactionsApi";

interface Props {
  transaction: Transaction;
  properties: readonly Property[];
  onClose: () => void;
  onVendorLearned?: (vendor: string, category: string, retroactiveCount: number) => void;
  onDeleted?: () => void;
  embedded?: boolean;
  duplicatePair?: DuplicatePair;
  onKeepDuplicate?: (keepId: string, deleteIds: string[]) => Promise<void>;
  onDismissDuplicate?: (transactionIds: string[]) => Promise<void>;
}


function buildDefaults(t: Transaction): TransactionFormValues {
  return {
    vendor: t.vendor ?? "",
    description: t.description ?? "",
    amount: t.amount,
    transaction_type: t.transaction_type,
    category: t.category,
    property_id: t.property_id ?? "",
    tax_relevant: t.tax_relevant,
    payment_method: t.payment_method ?? "",
    channel: t.channel ?? "",
    transaction_date: t.transaction_date,
    tax_year: t.tax_year,
  };
}

function buildPayload(data: TransactionFormValues, dirty: Partial<Record<keyof TransactionFormValues, boolean>>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(dirty) as (keyof TransactionFormValues)[]) {
    payload[key] = data[key] === "" ? null : data[key];
  }
  return payload;
}

export default function TransactionPanel({ transaction, properties, onClose, onVendorLearned, onDeleted, embedded, duplicatePair, onKeepDuplicate, onDismissDuplicate }: Props) {
  const [updateTransaction, { isLoading: isSaving }] = useUpdateTransactionMutation();
  const [deleteTransaction, { isLoading: isDeleting }] = useDeleteTransactionMutation();
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dupBusy, setDupBusy] = useState<"keep" | "dismiss" | null>(null);

  // Find the "other" transaction in the duplicate pair
  const dupOther = duplicatePair
    ? duplicatePair.transaction_a.id === transaction.id
      ? duplicatePair.transaction_b
      : duplicatePair.transaction_a
    : null;
  const [sourcePreview, setSourcePreview] = useState<{ url: string; type: string } | null>(null);
  const [isSavingAndClosing, setIsSavingAndClosing] = useState(false);

  const defaults = useMemo(() => buildDefaults(transaction), [transaction]);

  const { register, handleSubmit, watch, setValue, formState: { dirtyFields, isDirty } } = useForm<TransactionFormValues>({
    defaultValues: defaults,
  });

  const transactionType = watch("transaction_type");
  const categories = transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORY_LIST;

  const revokePreview = useCallback(() => {
    setSourcePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => revokePreview, [revokePreview]);

  useEffect(() => {
    if (!sourcePreview) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") revokePreview();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sourcePreview, revokePreview]);

  const handleViewSource = useCallback(async (docId: string) => {
    try {
      const res = await api.get(`/documents/${docId}/download`, { responseType: "blob" });
      const blob = res.data as Blob;
      const contentType = res.headers["content-type"] || "";
      const url = URL.createObjectURL(blob);
      const type = contentType.includes("pdf") ? "pdf" : contentType.startsWith("image/") ? "image" : "other";
      revokePreview();
      setSourcePreview({ url, type });
    } catch {
      revokePreview();
    }
  }, [revokePreview]);

  function fieldClass(name: keyof TransactionFormValues): string {
    return dirtyFields[name]
      ? "w-full border-2 border-primary rounded-md px-3 py-2 text-sm ring-1 ring-primary/20"
      : "w-full border rounded-md px-3 py-2 text-sm";
  }

  function selectClass(name: keyof TransactionFormValues): string {
    return dirtyFields[name] ? "w-full border-2 border-primary ring-1 ring-primary/20" : "w-full";
  }

  function notifyVendorLearned(result: Record<string, unknown>, data: TransactionFormValues) {
    const retroactiveCount = (result.retroactive_count as number) ?? 0;
    if (retroactiveCount >= 0 && dirtyFields.category && transaction.vendor && onVendorLearned) {
      onVendorLearned(transaction.vendor, data.category, retroactiveCount);
    }
  }


  async function onSave(data: TransactionFormValues) {
    const payload = buildPayload(data, dirtyFields);
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    try {
      const result = await updateTransaction({ id: transaction.id, data: payload as Partial<Transaction> }).unwrap();
      notifyVendorLearned(result as unknown as Record<string, unknown>, data);
      onClose();
    } catch {
      // save failed -- stay open so user can retry
    }
  }

  async function onSaveAndClose(data: TransactionFormValues) {
    setIsSavingAndClosing(true);
    setShowDiscardDialog(false);
    const payload = buildPayload(data, dirtyFields);
    try {
      const result = await updateTransaction({ id: transaction.id, data: payload as Partial<Transaction> }).unwrap();
      notifyVendorLearned(result as unknown as Record<string, unknown>, data);
      onClose();
    } catch {
      setIsSavingAndClosing(false);
    }
  }

  async function onApproveAndSave(data: TransactionFormValues) {
    const payload = buildPayload(data, dirtyFields);
    payload.status = "approved";
    try {
      const result = await updateTransaction({ id: transaction.id, data: payload as Partial<Transaction> }).unwrap();
      notifyVendorLearned(result as unknown as Record<string, unknown>, data);
      onClose();
    } catch {
      // save failed -- stay open
    }
  }

  function handleClose() {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteTransaction(transaction.id).unwrap();
      setShowDeleteDialog(false);
      onDeleted?.();
      onClose();
    } catch {
      // delete failed -- stay open so user sees the error
    }
  }

  const isPending = transaction.status === "pending" || transaction.status === "needs_review";

  const content = (
    <>
      {!embedded && (
      <div className="px-5 py-4 border-b space-y-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <h3 className="font-medium text-base truncate">{transaction.vendor ?? "Transaction"}</h3>
            <p className="text-xs text-muted-foreground">Created {formatDate(transaction.created_at)}</p>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0 ml-2" aria-label="Close panel">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <TransactionStatusBadge status={transaction.status} />
          <TransactionTypeBadge type={transaction.transaction_type} />
          {transaction.is_manual && <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">Manual</span>}
          {isDirty && <span className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded px-1.5 py-0.5">Unsaved changes</span>}
        </div>
      </div>
      )}

      <form id="transaction-panel-form" className="flex-1 overflow-y-auto px-5 py-4 space-y-4" onSubmit={handleSubmit(onSave)}>

        {transaction.status === "needs_review" && transaction.review_reason && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300">
            {transaction.review_reason}
          </div>
        )}

        {dupOther && onKeepDuplicate && onDismissDuplicate && (
          <div className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20 px-3 py-2 text-sm text-orange-800 dark:text-orange-300">
            <div className="flex items-center gap-2 mb-2">
              <Copy size={14} className="shrink-0" />
              <span className="font-medium">Possible duplicate</span>
            </div>
            <p className="text-xs mb-3">
              {dupOther.vendor ?? "Unknown vendor"} &mdash; ${dupOther.amount} on{" "}
              {formatDate(dupOther.transaction_date)}
              {dupOther.source_file_name && ` (${dupOther.source_file_name})`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={dupBusy !== null}
                onClick={async () => {
                  setDupBusy("keep");
                  try {
                    await onKeepDuplicate(transaction.id, [dupOther.id]);
                  } finally {
                    setDupBusy(null);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check size={12} />
                {dupBusy === "keep" ? "Keeping..." : "Keep this one"}
              </button>
              <button
                type="button"
                disabled={dupBusy !== null}
                onClick={async () => {
                  setDupBusy("dismiss");
                  try {
                    await onDismissDuplicate([transaction.id, dupOther.id]);
                  } finally {
                    setDupBusy(null);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-border hover:bg-muted disabled:opacity-50"
              >
                <XCircle size={12} />
                {dupBusy === "dismiss" ? "Dismissing..." : "Not duplicates"}
              </button>
            </div>
          </div>
        )}

        {transaction.source_file_name && transaction.source_document_id && (
          <div className="flex items-center gap-2 text-sm">
            <FileText size={14} className="text-muted-foreground shrink-0" />
            <button
              type="button"
              onClick={() => handleViewSource(transaction.source_document_id!)}
              className="text-primary hover:underline truncate text-left"
            >
              {transaction.source_file_name}
            </button>
          </div>
        )}

        {sourcePreview && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={revokePreview}>
            <div className="bg-card rounded-lg shadow-xl max-w-3xl max-h-[80vh] w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-sm font-medium truncate">{transaction.source_file_name}</span>
                <button type="button" onClick={revokePreview} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-auto max-h-[calc(80vh-3rem)] flex items-center justify-center">
                {sourcePreview.type === "pdf" ? (
                  <iframe src={sourcePreview.url} className="w-full h-[70vh]" title="Source document" />
                ) : sourcePreview.type === "image" ? (
                  <img src={sourcePreview.url} alt="Source document" className="max-w-full max-h-[70vh] object-contain" />
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    <a href={sourcePreview.url} download={transaction.source_file_name} className="text-primary hover:underline">
                      Download {transaction.source_file_name}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <FormField label="Date" dirty={!!dirtyFields.transaction_date}>
          <input
            type="date"
            {...register("transaction_date")}
            className={fieldClass("transaction_date")}
          />
        </FormField>

        <FormField label="Tax Year" dirty={!!dirtyFields.tax_year}>
          <input
            type="number"
            {...register("tax_year", { valueAsNumber: true })}
            className={fieldClass("tax_year")}
            min={2020}
            max={2099}
          />
        </FormField>

        <FormField label="Vendor" dirty={!!dirtyFields.vendor}>
          <input
            type="text"
            {...register("vendor")}
            className={fieldClass("vendor")}
          />
        </FormField>

        <FormField label="Description" dirty={!!dirtyFields.description}>
          <textarea
            {...register("description")}
            className={fieldClass("description")}
            rows={2}
          />
        </FormField>

        <FormField label="Amount" dirty={!!dirtyFields.amount}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
            <input
              type="number"
              {...register("amount")}
              className={`${fieldClass("amount")} pl-7`}
              step="0.01"
              min="0.01"
            />
          </div>
        </FormField>

        <FormField label="Type" dirty={!!dirtyFields.transaction_type}>
          <Select
            {...register("transaction_type", {
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                setValue("category", e.target.value === "income" ? "rental_revenue" : "maintenance", { shouldDirty: true });
              },
            })}
            className={selectClass("transaction_type")}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
        </FormField>

        <FormField label="Category" dirty={!!dirtyFields.category}>
          <Select {...register("category")} className={selectClass("category")}>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{formatTag(cat)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Property" dirty={!!dirtyFields.property_id}>
          <Select {...register("property_id")} className={selectClass("property_id")}>
            <option value="">No property</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Channel" dirty={!!dirtyFields.channel}>
          <Select {...register("channel")} className={selectClass("channel")}>
            <option value="">None</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{formatTag(c)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Payment Method" dirty={!!dirtyFields.payment_method}>
          <Select {...register("payment_method")} className={selectClass("payment_method")}>
            <option value="">None</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{formatTag(m)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Tax Relevant" dirty={!!dirtyFields.tax_relevant}>
          <label className={`flex items-center gap-2 text-sm ${dirtyFields.tax_relevant ? "text-primary font-medium" : ""}`}>
            <input
              type="checkbox"
              {...register("tax_relevant")}
              className="cursor-pointer"
            />
            <span>Include in tax reports</span>
          </label>
        </FormField>

        {transaction.schedule_e_line && (
          <div className="text-xs text-muted-foreground">
            Schedule E: {formatTag(transaction.schedule_e_line)}
          </div>
        )}
      </form>

      <div className="flex items-center justify-between gap-2 px-5 py-4 border-t">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            aria-label="Delete transaction"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isPending && (
            <LoadingButton
              size="sm"
              isLoading={isSaving}
              loadingText="Approving..."
              onClick={handleSubmit(onApproveAndSave)}
              type="button"
            >
              {isDirty ? "Save & Approve" : "Approve"}
            </LoadingButton>
          )}
          {isDirty && (
            <LoadingButton
              size="sm"
              variant="primary"
              isLoading={isSaving}
              loadingText="Saving..."
              type="submit"
              form="transaction-panel-form"
            >
              Save
            </LoadingButton>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDiscardDialog && !isSavingAndClosing}
        title="Unsaved changes"
        description="You have unsaved changes. Would you like to save them before closing?"
        confirmLabel="Save & Close"
        cancelLabel="Discard"
        onConfirm={() => { handleSubmit(onSaveAndClose)(); }}
        onCancel={() => { if (!isSavingAndClosing) { setShowDiscardDialog(false); onClose(); } }}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete transaction"
        description={`Are you sure you want to delete this ${transaction.vendor ? `"${transaction.vendor}"` : ""} transaction for $${transaction.amount}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </>
  );

  if (embedded) {
    return <div className="flex flex-col flex-1 overflow-hidden">{content}</div>;
  }

  return (
    <Panel position="right" onClose={handleClose}>
      {content}
    </Panel>
  );
}
