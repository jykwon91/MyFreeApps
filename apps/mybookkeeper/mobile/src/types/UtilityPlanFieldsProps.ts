import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import type { UtilityPlanFieldChange } from "./UtilityPlanFieldChange";

/** What a group of plan fields needs from the form that holds them. */
export interface UtilityPlanFieldsProps {
  values: UtilityPlanFormValues;
  onChange: UtilityPlanFieldChange;
  /** Only shown once the person has tried to save, so a half-typed form isn't scolded. */
  problems: UtilityPlanFormProblems;
  isBusy: boolean;
}
