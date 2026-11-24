import { useState } from "react";
import type { BudgetLine } from "@mybookkeeper/api-client/types/budget/budget-line";
import Badge from "@/shared/components/ui/Badge";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";
import BudgetAmountEditor from "./BudgetAmountEditor";
import BudgetProgressBar from "./BudgetProgressBar";
import { budgetLineNote } from "./budget-line-note";

export interface BudgetCategoryRowProps {
  line: BudgetLine;
  currency: string;
  /** "YYYY-MM" on screen; an edit applies from it onward. */
  month: string;
}

/** One category: spent against its budget, and the budget edited in place. */
export default function BudgetCategoryRow({ line, currency, month }: BudgetCategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const note = budgetLineNote(line, currency);
  const hasBudget = line.budget_cents !== null;

  return (
    <li className="border rounded-lg px-4 py-3 text-sm space-y-2" data-testid={`budget-line-${line.spending_category_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-medium truncate">{line.name}</p>
          {line.is_archived ? <Badge label={MSG.archived} color="gray" /> : null}
        </div>
        <p className="font-semibold tabular-nums shrink-0" data-testid="budget-line-amount">{note.amount}</p>
      </div>
      {hasBudget && line.percent_used !== null ? (
        <BudgetProgressBar percent={line.percent_used} isOver={line.is_over_budget} label={MSG.progressLabel(line.name)} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <p
          className={line.is_over_budget ? "font-medium text-destructive" : "text-muted-foreground"}
          data-testid="budget-line-status"
        >
          {note.status}
          {note.refunded ? <span className="text-muted-foreground"> · {note.refunded}</span> : null}
        </p>
        {!line.is_archived && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-primary hover:underline"
            data-testid="budget-edit"
          >
            {hasBudget ? MSG.editBudget : MSG.setBudget}
          </button>
        ) : null}
      </div>
      {editing ? <BudgetAmountEditor line={line} month={month} onDone={() => setEditing(false)} /> : null}
    </li>
  );
}
