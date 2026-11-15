import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";

/** Marks a control invalid and ties it to the message ``UtilityPlanFieldProblem`` renders. */
export function utilityPlanFieldAria(problems: UtilityPlanFormProblems, field: keyof UtilityPlanFormValues) {
  return problems[field]
    ? ({ "aria-invalid": true, "aria-describedby": `utility-plan-${field}-problem` } as const)
    : {};
}
