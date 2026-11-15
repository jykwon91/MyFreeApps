import { INSURANCE_POLICY_PROBLEM_MESSAGES } from "@mybookkeeper/api-client/constants/insurancePolicyProblemMessages";
import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";

export interface InsuranceFieldProblemProps {
  problems: InsurancePolicyFormProblems;
  field: keyof InsurancePolicyFormValues;
}

/** Says what is wrong with one field, under it. Renders nothing while the field is fine. */
export default function InsuranceFieldProblem({ problems, field }: InsuranceFieldProblemProps) {
  const problem = problems[field];
  if (!problem) return null;
  return (
    <p
      id={`insurance-${field}-problem`}
      role="alert"
      className="mt-1 text-xs text-destructive"
      data-testid={`insurance-${field}-problem`}
    >
      {INSURANCE_POLICY_PROBLEM_MESSAGES[problem]}
    </p>
  );
}
