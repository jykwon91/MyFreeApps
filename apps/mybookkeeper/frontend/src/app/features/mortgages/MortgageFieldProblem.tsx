import { mortgageProblemMessages } from "@mybookkeeper/api-client/constants/mortgageProblemMessages";
import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import FieldProblem from "@/shared/components/FieldProblem";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";
import { fieldProblemId } from "@/shared/utils/field-problem-aria";

export interface MortgageFieldProblemProps {
  problems: MortgageFormProblems;
  field: keyof MortgageFormValues;
}

/** Says what is wrong with one field, under it. Renders nothing while the field is fine. */
export default function MortgageFieldProblem({ problems, field }: MortgageFieldProblemProps) {
  const problem = problems[field];
  return (
    <FieldProblem
      id={fieldProblemId("mortgage", field)}
      message={problem && mortgageProblemMessages(NUMBER_INPUT_DECIMAL_SEPARATOR)[problem]}
    />
  );
}
