import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import { FormField } from "@platform/mobile";
import type { KeyboardTypeOptions } from "react-native";
import type { UtilityPlanFieldChange } from "../../types/UtilityPlanFieldChange";
import type { UtilityPlanTextFieldName } from "../../types/UtilityPlanTextFieldName";

interface UtilityPlanTextFieldProps {
  field: UtilityPlanTextFieldName;
  label: string;
  values: UtilityPlanFormValues;
  onChange: UtilityPlanFieldChange;
  problems: UtilityPlanFormProblems;
  isBusy: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

/** One typed field of the plan form: the label, the value, and the problem to point at. */
export default function UtilityPlanTextField({ field, label, values, onChange, problems, isBusy, keyboardType, maxLength, placeholder, required, hint }: UtilityPlanTextFieldProps) {
  return (
    <FormField
      editable={!isBusy}
      error={problems[field]}
      hint={hint}
      keyboardType={keyboardType}
      label={label}
      maxLength={maxLength}
      onChangeText={(text) => onChange(field, text)}
      placeholder={placeholder}
      required={required}
      value={values[field]}
    />
  );
}
