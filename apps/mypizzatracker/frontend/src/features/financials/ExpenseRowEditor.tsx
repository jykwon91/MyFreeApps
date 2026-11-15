import { useState } from "react";
import { Button, LoadingButton, extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { useUpdateExpenseMutation } from "@/store/financialsApi";
import type { ExpenseRowEditorProps } from "@/types/financials/ExpenseRowEditorProps";

/** Mounted only while editing, so its draft always starts from the current expense. */
export default function ExpenseRowEditor({ dropId, expense, onClose }: ExpenseRowEditorProps) {
  const [vendor, setVendor] = useState(expense.vendor);
  const [category, setCategory] = useState(expense.category);
  const [amount, setAmount] = useState(expense.amount);
  const [update, { isLoading: isUpdating }] = useUpdateExpenseMutation();

  const onSave = async () => {
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
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update expense");
    }
  };

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
        <LoadingButton size="sm" isLoading={isUpdating} loadingText="Saving..." onClick={onSave}>
          Save
        </LoadingButton>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </li>
  );
}
