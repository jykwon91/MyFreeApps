import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X, Trash2 } from "lucide-react";
import { formatDate } from "@/shared/utils/date";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { Property } from "@/shared/types/property/property";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import type { DuplicatePair } from "@/shared/types/transaction/duplicate";
import Panel from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import TransactionStatusBadge from "@/app/features/transactions/TransactionStatusBadge";
import TransactionTypeBadge from "@/app/features/transactions/TransactionTypeBadge";
import TransactionForm from "@/app/features/transactions/TransactionForm";
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
  const [isSavingAndClosing, setIsSavingAndClosing] = useState(false);

  const dupOther = duplicatePair
    ? duplicatePair.transaction_a.id === transaction.id
      ? duplicatePair.transaction_b
      : duplicatePair.transaction_a
    : null;

  const defaults = useMemo(() => buildDefaults(transaction), [transaction]);

  const { register, handleSubmit, watch, setValue, formState: { dirtyFields, isDirty } } = useForm<TransactionFormValues>({
    defaultValues: defaults,
  });

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

      <TransactionForm
        transaction={transaction}
        properties={properties}
        register={register}
        watch={watch}
        setValue={setValue}
        dirtyFields={dirtyFields}
        onSubmit={handleSubmit(onSave)}
        dupOther={dupOther}
        onKeepDuplicate={onKeepDuplicate}
        onDismissDuplicate={onDismissDuplicate}
      />

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
