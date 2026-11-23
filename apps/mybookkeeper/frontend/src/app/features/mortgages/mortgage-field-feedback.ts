import { mortgageProblemMessages } from "@mybookkeeper/api-client/constants/mortgageProblemMessages";
import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import type { FieldFeedbackProps } from "@platform/ui";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { fieldProblemFeedback } from "@/shared/utils/field-problem-feedback";

/** What is wrong with one mortgage field, said under it and tied to it. */
export function mortgageFieldFeedback(problems: MortgageFormProblems, field: keyof MortgageFormValues): FieldFeedbackProps {
  const problem = problems[field];
  return fieldProblemFeedback("mortgage", field, problem && mortgageProblemMessages(NUMBER_INPUT_DECIMAL_SEPARATOR)[problem]);
}
