import { useId, useState } from "react";
import { Button, LoadingButton, showError, showSuccess } from "@platform/ui";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { useSetCategoryBudgetMutation } from "@mybookkeeper/api-client/store/budgetApi";
import type { BudgetLine } from "@mybookkeeper/api-client/types/budget/budget-line";
import { centsToBalanceText } from "@mybookkeeper/api-client/utils/financialAccountForm";
import { formatMonthLong } from "@mybookkeeper/api-client/utils/monthText";
import { moneyInputError } from "@mybookkeeper/api-client/utils/moneyInputError";
import { moneyTextToCents } from "@mybookkeeper/api-client/utils/moneyTextToCents";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

export interface BudgetAmountEditorProps {
  line: BudgetLine;
  /** "YYYY-MM" the change applies from: the month on screen. */
  month: string;
  onDone: () => void;
}

type BudgetWrite = "save" | "remove";

/** A category's monthly budget, typed in place. It holds from the month on screen onward. */
export default function BudgetAmountEditor({ line, month, onDone }: BudgetAmountEditorProps) {
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState(centsToBalanceText(line.budget_cents));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<BudgetWrite | null>(null);
  const [setBudget] = useSetCategoryBudgetMutation();

  async function write(cents: number | null, action: BudgetWrite) {
    setPending(action);
    try {
      await setBudget({
        categoryId: line.spending_category_id,
        data: { effective_month: month, amount_cents: cents },
      }).unwrap();
      showSuccess(cents === null ? MSG.removed : MSG.saved);
      onDone();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.saveFailed));
      setPending(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = moneyInputError(text, NUMBER_INPUT_DECIMAL_SEPARATOR);
    setProblem(error);
    const cents = moneyTextToCents(text, NUMBER_INPUT_DECIMAL_SEPARATOR);
    if (error !== undefined || cents === null || cents === undefined) return;
    void write(cents, "save");
  }

  const busy = pending !== null;
  return (
    <form noValidate onSubmit={handleSubmit} className="mt-3 space-y-2" data-testid="budget-editor">
      <label htmlFor={inputId} className="block text-sm font-medium">{MSG.amountLabel(line.name)}</label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={problem !== undefined}
        aria-describedby={hintId}
        className="w-full sm:w-56 min-h-[44px] border rounded-md px-3 py-2 text-sm bg-background"
        data-testid="budget-input"
      />
      <p id={hintId} className={`text-xs ${problem === undefined ? "text-muted-foreground" : "text-destructive"}`} data-testid="budget-hint">
        {problem ?? MSG.appliesFrom(formatMonthLong(month))}
      </p>
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="submit" variant="primary" size="sm" className="min-h-[44px]"
          isLoading={pending === "save"} loadingText={MSG.saving} disabled={busy}
          data-testid="budget-save"
        >
          {MSG.save}
        </LoadingButton>
        {line.budget_cents !== null ? (
          <LoadingButton
            type="button" variant="secondary" size="sm" className="min-h-[44px]"
            isLoading={pending === "remove"} loadingText={MSG.saving} disabled={busy}
            onClick={() => void write(null, "remove")} data-testid="budget-remove"
          >
            {MSG.removeBudget}
          </LoadingButton>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={onDone} disabled={busy}>
          {MSG.cancel}
        </Button>
      </div>
    </form>
  );
}
