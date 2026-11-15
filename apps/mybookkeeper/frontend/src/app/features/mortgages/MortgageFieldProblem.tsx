import { MORTGAGE_PROBLEM_MESSAGES } from "@mybookkeeper/api-client/constants/mortgageProblemMessages";
import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";

export interface MortgageFieldProblemProps {
  problems: MortgageFormProblems;
  field: keyof MortgageFormValues;
}

/** Says what is wrong with one field, under it. Renders nothing while the field is fine. */
export default function MortgageFieldProblem({ problems, field }: MortgageFieldProblemProps) {
  const problem = problems[field];
  if (!problem) return null;
  return (
    <p
      id={`mortgage-${field}-problem`}
      role="alert"
      className="mt-1 text-xs text-destructive"
      data-testid={`mortgage-${field}-problem`}
    >
      {MORTGAGE_PROBLEM_MESSAGES[problem]}
    </p>
  );
}
