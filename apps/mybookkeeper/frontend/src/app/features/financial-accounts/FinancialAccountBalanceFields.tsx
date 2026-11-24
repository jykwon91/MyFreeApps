import { FieldFeedback, fieldFeedbackAria, FormField } from "@platform/ui";
import type { FinancialAccountFormProblems } from "@mybookkeeper/api-client/types/financial-account/financial-account-form-problems";
import type { FinancialAccountFormValues } from "@mybookkeeper/api-client/types/financial-account/financial-account-form-values";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG, FINANCIAL_ACCOUNT_PROBLEM_MESSAGES } from "@/shared/lib/financial-account-messages";
import { FINANCIAL_ACCOUNT_INPUT_CLASS } from "./financial-account-input-class";

export interface FinancialAccountBalanceFieldsProps {
  values: Pick<FinancialAccountFormValues, "balanceDollars" | "balanceAsOf">;
  onChange: (field: "balanceDollars" | "balanceAsOf", value: string) => void;
  problems: FinancialAccountFormProblems;
}

/** The balance and the date it was true on. Shared by the account form and the Update balance dialog. */
export default function FinancialAccountBalanceFields({ values, onChange, problems }: FinancialAccountBalanceFieldsProps) {
  const balanceError = problems.balanceDollars && FINANCIAL_ACCOUNT_PROBLEM_MESSAGES[problems.balanceDollars];
  const dateError = problems.balanceAsOf && FINANCIAL_ACCOUNT_PROBLEM_MESSAGES[problems.balanceAsOf];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Balance">
        {(field) => (
          <>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={values.balanceDollars}
                onChange={(e) => onChange("balanceDollars", e.target.value)}
                placeholder="0.00"
                className={`${FINANCIAL_ACCOUNT_INPUT_CLASS} pl-7`}
                data-testid="financial-account-balance-input"
                {...fieldFeedbackAria({ id: field.id, error: balanceError })}
                {...field}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{MSG.balanceHint}</p>
            <FieldFeedback id={field.id} error={balanceError} />
          </>
        )}
      </FormField>

      <FormField label="Balance as of">
        {(field) => (
          <>
            <input
              type="date"
              value={values.balanceAsOf}
              onChange={(e) => onChange("balanceAsOf", e.target.value)}
              className={FINANCIAL_ACCOUNT_INPUT_CLASS}
              data-testid="financial-account-balance-date-input"
              {...fieldFeedbackAria({ id: field.id, error: dateError })}
              {...field}
            />
            <FieldFeedback id={field.id} error={dateError} />
          </>
        )}
      </FormField>
    </div>
  );
}
