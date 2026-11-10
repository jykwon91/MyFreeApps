import type { AddApplicationFormValues } from "./add-application-form-values";

/** Why a field can't be saved yet, keyed by the field. */
export type AddApplicationFormProblems = Partial<Record<keyof AddApplicationFormValues, string>>;
