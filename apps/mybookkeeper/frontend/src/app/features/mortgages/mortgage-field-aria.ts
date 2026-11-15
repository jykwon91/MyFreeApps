import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";

/** Marks a control invalid and ties it to the message ``MortgageFieldProblem`` renders. */
export function mortgageFieldAria(problems: MortgageFormProblems, field: keyof MortgageFormValues) {
  return problems[field]
    ? ({ "aria-invalid": true, "aria-describedby": `mortgage-${field}-problem` } as const)
    : {};
}
