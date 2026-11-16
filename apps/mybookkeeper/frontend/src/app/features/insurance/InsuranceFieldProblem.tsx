import { insurancePolicyProblemMessages } from "@mybookkeeper/api-client/constants/insurancePolicyProblemMessages";
import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import FieldProblem from "@/shared/components/FieldProblem";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";
import { fieldProblemId } from "@/shared/utils/field-problem-aria";

export interface InsuranceFieldProblemProps {
  problems: InsurancePolicyFormProblems;
  field: keyof InsurancePolicyFormValues;
}

/** Says what is wrong with one field, under it. Renders nothing while the field is fine. */
export default function InsuranceFieldProblem({ problems, field }: InsuranceFieldProblemProps) {
  const problem = problems[field];
  return (
    <FieldProblem
      id={fieldProblemId("insurance", field)}
      message={problem && insurancePolicyProblemMessages(NUMBER_INPUT_DECIMAL_SEPARATOR)[problem]}
    />
  );
}
