import { insurancePolicyProblemMessages } from "@mybookkeeper/api-client/constants/insurancePolicyProblemMessages";
import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import type { FieldFeedbackProps } from "@platform/ui";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { fieldProblemFeedback } from "@/shared/utils/field-problem-feedback";

/** What is wrong with one insurance policy field, said under it and tied to it. */
export function insuranceFieldFeedback(
  problems: InsurancePolicyFormProblems,
  field: keyof InsurancePolicyFormValues,
): FieldFeedbackProps {
  const problem = problems[field];
  return fieldProblemFeedback(
    "insurance",
    field,
    problem && insurancePolicyProblemMessages(NUMBER_INPUT_DECIMAL_SEPARATOR)[problem],
  );
}
