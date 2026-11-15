import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";

/** Marks a control invalid and ties it to the message ``InsuranceFieldProblem`` renders. */
export function insuranceFieldAria(problems: InsurancePolicyFormProblems, field: keyof InsurancePolicyFormValues) {
  return problems[field]
    ? ({ "aria-invalid": true, "aria-describedby": `insurance-${field}-problem` } as const)
    : {};
}
