import { useState } from "react";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { financialAccountFormProblems } from "@mybookkeeper/api-client/utils/financialAccountForm";
import type { FinancialAccountFormProblems } from "@mybookkeeper/api-client/types/financial-account/financial-account-form-problems";
import type { FinancialAccountFormValues } from "@mybookkeeper/api-client/types/financial-account/financial-account-form-values";

export interface FinancialAccountFormState {
  values: FinancialAccountFormValues;
  setField: <K extends keyof FinancialAccountFormValues>(field: K, value: FinancialAccountFormValues[K]) => void;
  /** Shown only once a save has been tried, so an empty form doesn't open covered in errors. */
  problems: FinancialAccountFormProblems;
  /** Marks the form as tried; true when it can be saved. */
  passes: () => boolean;
}

export function useFinancialAccountForm(initial: FinancialAccountFormValues): FinancialAccountFormState {
  const [values, setValues] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = financialAccountFormProblems(values, NUMBER_INPUT_DECIMAL_SEPARATOR);

  function setField<K extends keyof FinancialAccountFormValues>(field: K, value: FinancialAccountFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function passes(): boolean {
    setTried(true);
    return Object.keys(problems).length === 0;
  }

  return { values, setField, problems: tried ? problems : {}, passes };
}
