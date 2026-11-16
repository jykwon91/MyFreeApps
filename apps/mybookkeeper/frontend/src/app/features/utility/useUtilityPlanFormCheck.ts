import { useState } from "react";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";
import { utilityPlanFormProblems } from "@mybookkeeper/api-client/utils/utilityPlanForm";
import type { UtilityPlanFormProblems } from "@mybookkeeper/api-client/types/utility/utility-plan-form-problems";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";

export interface UtilityPlanFormCheck {
  /** Empty until a save was tried, so a half-typed form isn't scolded. */
  problems: UtilityPlanFormProblems;
  /** Marks the save as tried; true when nothing stands in the way of sending. */
  passes: () => boolean;
}

/** The same checks the phone runs, so a bad figure is caught here rather than as a failed save. */
export function useUtilityPlanFormCheck(values: UtilityPlanFormValues): UtilityPlanFormCheck {
  const [hasTried, setHasTried] = useState(false);
  const found = utilityPlanFormProblems(values, NUMBER_INPUT_DECIMAL_SEPARATOR);
  return {
    problems: hasTried ? found : {},
    passes: () => {
      setHasTried(true);
      return Object.keys(found).length === 0;
    },
  };
}
