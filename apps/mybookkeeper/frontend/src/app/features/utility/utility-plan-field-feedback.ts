import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import type { FieldFeedbackProps } from "@platform/ui";
import { fieldProblemFeedback } from "@/shared/utils/field-problem-feedback";

/** What is wrong with one utility plan field, said under it and tied to it. */
export function utilityPlanFieldFeedback(
  problems: UtilityPlanFormProblems,
  field: keyof UtilityPlanFormValues,
): FieldFeedbackProps {
  return fieldProblemFeedback("utility-plan", field, problems[field]);
}
