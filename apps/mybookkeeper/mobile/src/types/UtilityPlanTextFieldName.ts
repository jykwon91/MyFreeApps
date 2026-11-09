import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";

/** The form fields that hold typed text, as opposed to a choice or a switch. */
export type UtilityPlanTextFieldName = Exclude<
  { [Field in keyof UtilityPlanFormValues]: UtilityPlanFormValues[Field] extends string ? Field : never }[keyof UtilityPlanFormValues],
  "serviceType" | "rateType"
>;
