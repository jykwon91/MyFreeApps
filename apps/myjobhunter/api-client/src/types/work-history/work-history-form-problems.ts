import type { WorkHistoryFormValues } from "./work-history-form-values";

/** Why a field can't be saved yet, keyed by the field. */
export type WorkHistoryFormProblems = Partial<Record<keyof WorkHistoryFormValues, string>>;
