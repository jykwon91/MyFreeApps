import { useState } from "react";
import { Button } from "@platform/ui";
import ExpenseForm from "@/features/financials/ExpenseForm";
import ExpenseRow from "@/features/financials/ExpenseRow";
import type { ExpensesSectionProps } from "@/types/financials/ExpensesSectionProps";

export default function ExpensesSection({ data, readOnly }: ExpensesSectionProps) {
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
