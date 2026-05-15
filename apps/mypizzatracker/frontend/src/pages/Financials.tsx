import { useEffect, useMemo, useState } from "react"; // useEffect: drop_id URL sync
import { useSearchParams } from "react-router-dom";
import {
  Button,
  ConfirmDialog,
  LoadingButton,
  Select,
  Skeleton,
  StatusBadge,
  extractErrorMessage,
  showError,
  showSuccess,
} from "@platform/ui";
import { useListDropsQuery } from "@/store/dropsApi";
import {
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useGetFinancialsQuery,
  useUpdateExpenseMutation,
  useUpdateTipMutation,
} from "@/store/financialsApi";
import type {
  DropFinancials,
  ExpenseRead,
} from "@/types/financials/financials";
import { HEALTH_LABELS, HEALTH_TONES, formatMoney } from "@/features/financials/health";

export default function Financials() {
  const drops = useListDropsQuery();
  const [params, setParams] = useSearchParams();
  const dropIdParam = params.get("drop_id");

  const selectedDropId = useMemo(() => {
    if (dropIdParam) return dropIdParam;
    if (!drops.data || drops.data.length === 0) return null;
    // Default: today's active drop, fallback to most recent (already sorted
    // newest-first by the backend).
    const today = new Date().toISOString().slice(0, 10);
    const active = drops.data.find((d) => d.status === "active" && d.date === today);
    return (active ?? drops.data[0]).id;
  }, [dropIdParam, drops.data]);

  useEffect(() => {
    if (selectedDropId && !dropIdParam) {
      setParams({ drop_id: selectedDropId }, { replace: true });
    }
  }, [selectedDropId, dropIdParam, setParams]);

  if (drops.isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!drops.data || drops.data.length === 0) {
    return (
      <div className="p-4 rounded border bg-card text-center space-y-1">
        <p className="font-medium">No drops yet</p>
        <p className="text-sm text-muted-foreground">
          Create a drop on the Drops page to start tracking financials.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Financials</h1>
        <Select
          aria-label="Select drop"
          value={selectedDropId ?? ""}
          onChange={(e) => setParams({ drop_id: e.target.value }, { replace: true })}
          className="min-w-[12rem]"
        >
          {drops.data.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.date} ({d.status})
            </option>
          ))}
        </Select>
      </header>

      {selectedDropId ? <FinancialsBody dropId={selectedDropId} /> : null}
    </div>
  );
}

function FinancialsBody({ dropId }: { dropId: string }) {
  const { data, isLoading, isError, refetch } = useGetFinancialsQuery(dropId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Failed to load financials.</p>
        <Button size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const readOnly = data.drop.status === "closed";

  return (
    <div className="space-y-4">
      <SummaryCard data={data} readOnly={readOnly} />
      <ExpensesSection data={data} readOnly={readOnly} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card -- health + numbers + tip edit
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  data: DropFinancials;
  readOnly: boolean;
}

function SummaryCard({ data, readOnly }: SummaryCardProps) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{data.drop.name}</h2>
          <p className="text-xs text-muted-foreground">{data.drop.date} · {data.drop.status}</p>
        </div>
        <StatusBadge
          tone={HEALTH_TONES[data.health]}
          label={HEALTH_LABELS[data.health]}
        />
      </div>

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Pizza count</dt>
        <dd className="text-right tabular-nums">{data.pizza_count}</dd>

        <dt className="text-muted-foreground">Revenue</dt>
        <dd className="text-right tabular-nums">${formatMoney(data.revenue)}</dd>

        <dt className="text-muted-foreground">Tip</dt>
        <dd className="text-right tabular-nums">
          <TipEditor
            key={data.tip_total}
            dropId={data.drop.id}
            current={data.tip_total}
            readOnly={readOnly}
          />
        </dd>

        <dt className="text-muted-foreground">Expenses</dt>
        <dd className="text-right tabular-nums">-${formatMoney(data.expense_total)}</dd>

        <dt className="text-base font-semibold pt-2 border-t mt-1">Profit</dt>
        <dd className="text-right text-base font-semibold tabular-nums pt-2 border-t mt-1">
          ${formatMoney(data.profit)}
        </dd>
      </dl>
    </section>
  );
}

interface TipEditorProps {
  dropId: string;
  current: string;
  readOnly: boolean;
}

function TipEditor({ dropId, current, readOnly }: TipEditorProps) {
  // ``current`` is keyed by RTK Query cache; remounting on change reseeds
  // ``value`` without a sync-effect (which would trip
  // react-hooks/set-state-in-effect). Parent passes key=current.
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [save, { isLoading }] = useUpdateTipMutation();

  const onSave = async () => {
    try {
      await save({ dropId, tipTotal: value }).unwrap();
      showSuccess("Tip updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update tip");
    }
  };

  if (readOnly) return <span>${formatMoney(current)}</span>;

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2 justify-end">
        ${formatMoney(current)}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isLoading}
        className="h-8 w-20 rounded border px-2 text-right tabular-nums"
      />
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Saving..."
        onClick={onSave}
      >
        Save
      </LoadingButton>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setValue(current);
          setEditing(false);
        }}
        disabled={isLoading}
      >
        Cancel
      </Button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expenses section -- add form + list
// ---------------------------------------------------------------------------

interface ExpensesSectionProps {
  data: DropFinancials;
  readOnly: boolean;
}

function ExpensesSection({ data, readOnly }: ExpensesSectionProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Expenses</h3>
        {!readOnly ? (
          <Button
            size="sm"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "+ Add expense"}
          </Button>
        ) : null}
      </div>

      {showForm && !readOnly ? (
        <ExpenseForm
          dropId={data.drop.id}
          onDone={() => setShowForm(false)}
        />
      ) : null}

      {data.expenses.length === 0 ? (
        <div className="rounded border bg-background p-3 text-center text-sm text-muted-foreground">
          {readOnly
            ? "This drop has no expenses logged."
            : "No expenses recorded — add one above to start tracking spending."}
        </div>
      ) : (
        <ul className="divide-y">
          {data.expenses.map((e) => (
            <ExpenseRow
              key={e.id}
              dropId={data.drop.id}
              expense={e}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface ExpenseFormProps {
  dropId: string;
  onDone: () => void;
}

function ExpenseForm({ dropId, onDone }: ExpenseFormProps) {
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

interface ExpenseRowProps {
  dropId: string;
  expense: ExpenseRead;
  readOnly: boolean;
}

function ExpenseRow({ dropId, expense, readOnly }: ExpenseRowProps) {
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
