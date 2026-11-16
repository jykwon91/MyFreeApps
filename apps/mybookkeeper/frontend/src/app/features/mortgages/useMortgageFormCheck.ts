import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";
import { useState } from "react";
import { mortgageFormProblems } from "@mybookkeeper/api-client/utils/mortgageFormProblems";
import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";

export interface MortgageFormCheck {
  /** Empty until a save was tried, so a half-typed form isn't scolded. */
  problems: MortgageFormProblems;
  /** Marks the save as tried; true when nothing stands in the way of sending. */
  passes: () => boolean;
}

/** The same checks the phone runs, so a bad figure is caught here rather than as a failed save. */
export function useMortgageFormCheck(values: MortgageFormValues): MortgageFormCheck {
  const [hasTried, setHasTried] = useState(false);
  const found = mortgageFormProblems(values, NUMBER_INPUT_DECIMAL_SEPARATOR);
  return {
    problems: hasTried ? found : {},
    passes: () => {
      setHasTried(true);
      return Object.keys(found).length === 0;
    },
  };
}
