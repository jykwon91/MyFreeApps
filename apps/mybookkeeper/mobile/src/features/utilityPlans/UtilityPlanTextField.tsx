import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import { type FieldPreset, FormField } from "@platform/mobile";
import type { UtilityPlanFieldChange } from "../../types/UtilityPlanFieldChange";
import type { UtilityPlanTextFieldName } from "../../types/UtilityPlanTextFieldName";

interface UtilityPlanTextFieldProps {
  field: UtilityPlanTextFieldName;
  label: string;
  values: UtilityPlanFormValues;
  onChange: UtilityPlanFieldChange;
  problems: UtilityPlanFormProblems;
  isBusy: boolean;
  /** The keyboard, autocorrect and autofill for what the field holds. */
  preset?: FieldPreset;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

/** One typed field of the plan form: the label, the value, and the problem to point at. */
export default function UtilityPlanTextField({ field, label, values, onChange, problems, isBusy, preset, maxLength, placeholder, required, hint }: UtilityPlanTextFieldProps) {
  return (
    <FormField
      {...preset}
      editable={!isBusy}
      error={problems[field]}
      hint={hint}
      label={label}
      maxLength={maxLength}
      onChangeText={(text) => onChange(field, text)}
      placeholder={placeholder}
      required={required}
      value={values[field]}
    />
  );
}
