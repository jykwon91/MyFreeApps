import type { UtilityPlanFormValues } from "./utility-plan-form-values";

/** The message to show beside each field that can't be saved as it stands. */
export type UtilityPlanFormProblems = Partial<Record<keyof UtilityPlanFormValues, string>>;
