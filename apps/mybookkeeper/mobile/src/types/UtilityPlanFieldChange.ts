import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";

export type UtilityPlanFieldChange = <Field extends keyof UtilityPlanFormValues>(field: Field, value: UtilityPlanFormValues[Field]) => void;
