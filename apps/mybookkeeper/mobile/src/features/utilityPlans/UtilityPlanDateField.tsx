import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import type { UtilityPlanFieldChange } from "../../types/UtilityPlanFieldChange";
import OptionalDateField from "../shell/OptionalDateField";

interface UtilityPlanDateFieldProps {
  field: "serviceStartDate" | "termEndDate";
  label: string;
  values: UtilityPlanFormValues;
  onChange: UtilityPlanFieldChange;
  problems: UtilityPlanFormProblems;
  today: Date;
}

export default function UtilityPlanDateField({ field, label, values, onChange, problems, today }: UtilityPlanDateFieldProps) {
  return <OptionalDateField error={problems[field]} label={label} onChange={(iso) => onChange(field, iso ?? "")} startsAt={today} value={values[field] || null} />;
}
