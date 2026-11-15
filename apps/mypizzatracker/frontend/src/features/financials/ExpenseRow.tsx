import { useState } from "react";
import { Button, ConfirmDialog, extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { useDeleteExpenseMutation } from "@/store/financialsApi";
import { formatMoney } from "@/lib/formatMoney";
import ExpenseRowEditor from "./ExpenseRowEditor";
import type { ExpenseRowProps } from "@/types/financials/ExpenseRowProps";

export default function ExpenseRow({ dropId, expense, readOnly }: ExpenseRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [del, { isLoading: isDeleting }] = useDeleteExpenseMutation();
  const [editing, setEditing] = useState(false);

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

  if (editing && !readOnly) {
    return <ExpenseRowEditor dropId={dropId} expense={expense} onClose={() => setEditing(false)} />;
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
