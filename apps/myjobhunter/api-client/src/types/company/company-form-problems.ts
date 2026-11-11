import type { CompanyFormValues } from "./company-form-values";

/** Why a field can't be saved yet, keyed by the field. */
export type CompanyFormProblems = Partial<Record<keyof CompanyFormValues, string>>;
