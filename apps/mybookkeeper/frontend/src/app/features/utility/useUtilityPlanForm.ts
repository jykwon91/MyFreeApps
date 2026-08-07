import { useCallback, useState } from "react";
import { EMPTY_UTILITY_PLAN_FORM } from "@/shared/lib/utility-plan-form";
import type { UtilityPlanFormValues } from "@/shared/types/utility/utility-plan-form-values";

export interface UtilityPlanFormState {
  values: UtilityPlanFormValues;
  setField: <K extends keyof UtilityPlanFormValues>(
    key: K,
    value: UtilityPlanFormValues[K],
  ) => void;
}

/**
 * Field state for the utility-plan form, shared by the add and edit dialogs.
 *
 * ``initialValues`` is read once, at mount. The edit dialog therefore mounts
 * its form only after the plan has loaded rather than syncing later through an
 * effect — an effect that overwrote state on refetch would discard whatever the
 * operator had typed in the meantime.
 */
export function useUtilityPlanForm(
  initialValues: UtilityPlanFormValues = EMPTY_UTILITY_PLAN_FORM,
): UtilityPlanFormState {
  const [values, setValues] = useState<UtilityPlanFormValues>(initialValues);

  const setField = useCallback(
    <K extends keyof UtilityPlanFormValues>(key: K, value: UtilityPlanFormValues[K]) => {
      setValues((previous) => ({ ...previous, [key]: value }));
    },
    [],
  );

  return { values, setField };
}
