import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import FieldProblem from "@/shared/components/FieldProblem";
import { fieldProblemId } from "@/shared/utils/field-problem-aria";

export interface UtilityPlanFieldProblemProps {
  problems: UtilityPlanFormProblems;
  field: keyof UtilityPlanFormValues;
}

/** Says what is wrong with one field, under it. Renders nothing while the field is fine. */
export default function UtilityPlanFieldProblem({ problems, field }: UtilityPlanFieldProblemProps) {
  return <FieldProblem id={fieldProblemId("utility-plan", field)} message={problems[field]} />;
}
