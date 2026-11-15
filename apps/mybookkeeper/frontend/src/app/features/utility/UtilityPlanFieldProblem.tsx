import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";

export interface UtilityPlanFieldProblemProps {
  problems: UtilityPlanFormProblems;
  field: keyof UtilityPlanFormValues;
}

/** Says what is wrong with one field, under it. Renders nothing while the field is fine. */
export default function UtilityPlanFieldProblem({ problems, field }: UtilityPlanFieldProblemProps) {
  const problem = problems[field];
  if (!problem) return null;
  return (
    <p
      id={`utility-plan-${field}-problem`}
      role="alert"
      className="mt-1 text-xs text-destructive"
      data-testid={`utility-plan-${field}-problem`}
    >
      {problem}
    </p>
  );
}
