import { useState } from "react";
import { insurancePolicyFormProblems } from "@mybookkeeper/api-client/utils/insurancePolicyFormProblems";
import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";

export interface InsurancePolicyFormCheck {
  /** Empty until a save was tried, so a half-typed form isn't scolded. */
  problems: InsurancePolicyFormProblems;
  /** Marks the save as tried; true when nothing stands in the way of sending. */
  passes: () => boolean;
}

/** The same checks the phone runs, so a bad figure is caught here rather than as a failed save. */
export function useInsurancePolicyFormCheck(values: InsurancePolicyFormValues): InsurancePolicyFormCheck {
  const [hasTried, setHasTried] = useState(false);
  const found = insurancePolicyFormProblems(values);
  return {
    problems: hasTried ? found : {},
    passes: () => {
      setHasTried(true);
      return Object.keys(found).length === 0;
    },
  };
}
