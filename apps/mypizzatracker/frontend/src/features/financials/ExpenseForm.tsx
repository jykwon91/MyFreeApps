import { useState } from "react";
import { LoadingButton, extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { useCreateExpenseMutation } from "@/store/financialsApi";
import type { ExpenseFormProps } from "@/types/financials/ExpenseFormProps";

export default function ExpenseForm({ dropId, onDone }: ExpenseFormProps) {
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [save, { isLoading }] = useCreateExpenseMutation();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await save({
        dropId,
        body: {
          vendor: vendor.trim(),
          category: category.trim(),
          amount,
          description: description.trim() || null,
        },
      }).unwrap();
      showSuccess("Expense added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add expense");
    }
  };

  const valid =
    vendor.trim().length > 0 &&
    category.trim().length > 0 &&
    Number(amount) > 0;

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded border bg-background p-3"
    >
      <input
        type="text"
        placeholder="Vendor"
        value={vendor}
        onChange={(e) => setVendor(e.target.value)}
        disabled={isLoading}
        className="h-9 rounded border px-2"
        aria-label="Vendor"
      />
      <input
        type="text"
        placeholder="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={isLoading}
        className="h-9 rounded border px-2"
        aria-label="Category"
      />
      <input
        type="number"
        placeholder="Amount"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={isLoading}
        className="h-9 rounded border px-2 tabular-nums"
        aria-label="Amount"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isLoading}
        className="h-9 rounded border px-2"
        aria-label="Description"
      />
      <div className="sm:col-span-2 flex justify-end">
        <LoadingButton
          size="sm"
          isLoading={isLoading}
          loadingText="Saving..."
          disabled={!valid || isLoading}
          type="submit"
        >
          Add expense
        </LoadingButton>
      </div>
    </form>
  );
}
