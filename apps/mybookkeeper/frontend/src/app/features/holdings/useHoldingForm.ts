import { useState } from "react";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { holdingFormProblems } from "@mybookkeeper/api-client/utils/holdingForm";
import type { HoldingFormProblems } from "@mybookkeeper/api-client/types/investments/holding-form-problems";
import type { HoldingFormValues } from "@mybookkeeper/api-client/types/investments/holding-form-values";

export interface HoldingFormState {
  values: HoldingFormValues;
  setField: <K extends keyof HoldingFormValues>(field: K, value: HoldingFormValues[K]) => void;
  /** Shown only once a save has been tried, so an empty form doesn't open covered in errors. */
  problems: HoldingFormProblems;
  /** Marks the form as tried; true when it can be saved. */
  passes: () => boolean;
}

export function useHoldingForm(initial: HoldingFormValues): HoldingFormState {
  const [values, setValues] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = holdingFormProblems(values, NUMBER_INPUT_DECIMAL_SEPARATOR);

  function setField<K extends keyof HoldingFormValues>(field: K, value: HoldingFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function passes(): boolean {
    setTried(true);
    return Object.keys(problems).length === 0;
  }

  return { values, setField, problems: tried ? problems : {}, passes };
}
