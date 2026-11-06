import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { useForm } from "react-hook-form";
import { X, Trash2 } from "lucide-react";
import { formatDate } from "@/shared/utils/date";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import { Panel, PanelTitle } from "@platform/ui";
import { LoadingButton } from "@platform/ui";
import { ConfirmDialog } from "@platform/ui";
import TransactionStatusBadge from "@/app/features/transactions/TransactionStatusBadge";
import TransactionTypeBadge from "@/app/features/transactions/TransactionTypeBadge";
import TransactionForm from "@/app/features/transactions/TransactionForm";
import UnsavedChangesDialog from "@/app/features/transactions/UnsavedChangesDialog";
import { showError } from "@/shared/lib/toast-store";
import { TRANSACTION_EDIT_MESSAGES as MSG } from "@/shared/lib/transaction-edit-messages";
import type { TransactionPanelHandle } from "@/shared/types/transaction/transaction-panel-handle";
import AttributeTenantPicker from "@/app/features/transactions/AttributeTenantPicker";
import { useUpdateTransactionMutation, useDeleteTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";

export interface TransactionPanelProps {
  transaction: Transaction;
  properties: readonly Property[];
  onClose: () => void;
  onVendorLearned?: (vendor: string, category: string, retroactiveCount: number) => void;
  onDeleted?: () => void;
  embedded?: boolean;
  duplicatePair?: DuplicatePair;
  onKeepDuplicate?: (keepId: string, deleteIds: string[]) => Promise<void>;
  onDismissDuplicate?: (transactionIds: string[]) => Promise<void>;
  /** Embedded use: the parent closes through this so unsaved edits are never dropped. */
  ref?: Ref<TransactionPanelHandle>;
}

function buildDefaults(t: Transaction): TransactionFormValues {
  return {
    vendor: t.vendor ?? "",
    vendor_id: t.vendor_id ?? "",
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

export default function TransactionPanel({ transaction, properties, onClose, onVendorLearned, onDeleted, embedded, duplicatePair, onKeepDuplicate, onDismissDuplicate, ref }: TransactionPanelProps) {
  const [updateTransaction, { isLoading: isSaving }] = useUpdateTransactionMutation();
  const [deleteTransaction, { isLoading: isDeleting }] = useDeleteTransactionMutation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // What to run once unsaved edits are discarded or saved; non-null = prompt is open.
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const [unsavedSaveError, setUnsavedSaveError] = useState<string | null>(null);
  // Set synchronously on the prompt's Save & close: isSaving only turns true a render
  // later, and a second click in that gap would save twice and close twice.
  const closeInFlight = useRef(false);
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

  async function save(data: TransactionFormValues, extra: Record<string, unknown> = {}): Promise<boolean> {
    const payload = { ...buildPayload(data, dirtyFields), ...extra };
    if (Object.keys(payload).length === 0) return true;
    try {
      const result = await updateTransaction({ id: transaction.id, data: payload as Partial<Transaction> }).unwrap();
      notifyVendorLearned(result as unknown as Record<string, unknown>, data);
      return true;
    } catch {
      showError(MSG.couldntSave);
      return false;
    }
  }

  async function onSave(data: TransactionFormValues) {
    if (await save(data)) onClose();
  }

  async function onApproveAndSave(data: TransactionFormValues) {
    if (await save(data, { status: "approved" })) onClose();
  }

  function requestClose(afterClose: () => void) {
    if (!isDirty) {
      afterClose();
      return;
    }
    setUnsavedSaveError(null);
    setPendingClose(() => afterClose);
  }

  useImperativeHandle(ref, () => ({ requestClose }));

  // Closing or reloading the tab gets the browser's own "leave site?" prompt.
  useEffect(() => {
    if (!isDirty) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function handleClose() {
    requestClose(onClose);
  }

  function handleKeepEditing() {
    if (closeInFlight.current) return;
    setPendingClose(null);
  }

  function handleDiscard() {
    if (closeInFlight.current) return;
    const afterClose = pendingClose;
    setPendingClose(null);
    afterClose?.();
  }

  async function onSaveAndClose(data: TransactionFormValues) {
    if (await save(data)) {
      const afterClose = pendingClose;
      setPendingClose(null);
      afterClose?.();
    } else {
      setUnsavedSaveError(MSG.couldntSave);
    }
  }

  function handleSaveAndClose() {
    if (closeInFlight.current) return;
    closeInFlight.current = true;
    setIsSavingAndClosing(true);
    setUnsavedSaveError(null);
    void handleSubmit(onSaveAndClose)().finally(() => {
      closeInFlight.current = false;
      setIsSavingAndClosing(false);
    });
  }

  async function handleConfirmDelete() {
    try {
      await deleteTransaction(transaction.id).unwrap();
      setShowDeleteDialog(false);
      onDeleted?.();
      onClose();
    } catch {
      showError(MSG.couldntDelete);
    }
  }

  const isPending = transaction.status === "pending" || transaction.status === "needs_review";

  const content = (
    <>
      {!embedded && (
        <div className="px-5 py-4 border-b space-y-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1 min-w-0">
              <PanelTitle asChild>
                <h3 className="font-medium text-base truncate">{transaction.vendor ?? "Transaction"}</h3>
              </PanelTitle>
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

      {transaction.transaction_type === "income" && (
        <div className="px-5 py-4 border-t space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Attribute to tenant
          </p>
          <AttributeTenantPicker
            transactionId={transaction.id}
            currentApplicantId={transaction.applicant_id}
            currentAttributionSource={transaction.attribution_source}
          />
        </div>
      )}

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

      <UnsavedChangesDialog
        open={pendingClose !== null}
        isSaving={isSaving || isSavingAndClosing}
        error={unsavedSaveError}
        onKeepEditing={handleKeepEditing}
        onDiscard={handleDiscard}
        onSave={handleSaveAndClose}
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
