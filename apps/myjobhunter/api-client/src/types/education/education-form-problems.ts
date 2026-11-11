import type { EducationFormValues } from "./education-form-values";

/** Why a field can't be saved yet, keyed by the field. */
export type EducationFormProblems = Partial<Record<keyof EducationFormValues, string>>;
