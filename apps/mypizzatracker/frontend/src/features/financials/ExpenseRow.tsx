import { useState } from "react";
import { Button, ConfirmDialog, LoadingButton, extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { useDeleteExpenseMutation, useUpdateExpenseMutation } from "@/store/financialsApi";
import { formatMoney } from "@/lib/formatMoney";
import type { ExpenseRowProps } from "@/types/financials/ExpenseRowProps";

export default function ExpenseRow({ dropId, expense, readOnly }: ExpenseRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [del, { isLoading: isDeleting }] = useDeleteExpenseMutation();
  const [editing, setEditing] = useState(false);
  const [vendor, setVendor] = useState(expense.vendor);
  const [category, setCategory] = useState(expense.category);
  const [amount, setAmount] = useState(expense.amount);
  const [update, { isLoading: isUpdating }] = useUpdateExpenseMutation();

  const onDelete = async () => {
    try {
      await del({ dropId, expenseId: expense.id }).unwrap();
      showSuccess("Expense deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete expense");
    } finally {
      setConfirmDelete(false);
    }
  };

  const onSaveEdit = async () => {
    try {
      await update({
        dropId,
        expenseId: expense.id,
        body: {
          vendor: vendor.trim(),
          category: category.trim(),
          amount,
        },
      }).unwrap();
      showSuccess("Expense updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update expense");
    }
  };

  if (editing && !readOnly) {
    return (
      <li className="py-2 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
        <input
          type="text"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
          aria-label="Vendor"
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8 rounded border px-2 text-sm"
          aria-label="Category"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 rounded border px-2 text-sm tabular-nums"
          aria-label="Amount"
        />
        <div className="flex items-center gap-1 justify-end">
          <LoadingButton
            size="sm"
            isLoading={isUpdating}
            loadingText="Saving..."
            onClick={onSaveEdit}
          >
            Save
          </LoadingButton>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{expense.vendor}</div>
        <div className="text-xs text-muted-foreground truncate">
          {expense.category}
          {expense.description ? ` — ${expense.description}` : ""}
        </div>
      </div>
      <div className="text-sm tabular-nums shrink-0">
        ${formatMoney(expense.amount)}
      </div>
      {!readOnly ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete "${expense.vendor}" expense?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </li>
  );
}
