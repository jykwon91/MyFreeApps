import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { MonthlyExpenseCategory } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-category";
import type { MonthlyExpensesQuery } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses-query";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import MonthlyExpenseCategoryDetail from "./MonthlyExpenseCategoryDetail";

export interface MonthlyExpenseCategoryRowProps {
  category: MonthlyExpenseCategory;
  currency: string;
  query: MonthlyExpensesQuery;
}

/** One heading: what it costs a month and its share; opens to the payments behind it. */
export default function MonthlyExpenseCategoryRow({ category, currency, query }: MonthlyExpenseCategoryRowProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <li className="border rounded-lg text-sm" data-testid="monthly-expense-category">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((current) => !current)}
        className="w-full min-h-[44px] px-4 py-3 text-left space-y-2 rounded-lg hover:bg-muted/50"
        data-testid="monthly-expense-category-toggle"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            />
            <p className="font-medium break-words" data-testid="monthly-expense-category-label">{category.label}</p>
          </div>
          <p className="font-semibold tabular-nums shrink-0" data-testid="monthly-expense-category-average">
            {formatAccountBalance(category.average_cents, currency)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{MSG.perMonth}</span>
          </p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted" aria-hidden="true">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(category.share_percent, 100)}%` }} />
        </div>
        <p className="text-xs text-muted-foreground" data-testid="monthly-expense-category-share">
          {MSG.shareOf(category.share_percent)}
        </p>
      </button>
      {open ? (
        <div id={detailId} className="border-t px-4 py-3">
          <MonthlyExpenseCategoryDetail label={category.label} query={query} />
        </div>
      ) : null}
    </li>
  );
}
