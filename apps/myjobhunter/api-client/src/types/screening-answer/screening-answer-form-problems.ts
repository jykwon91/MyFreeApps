import type { ScreeningAnswerFormValues } from "./screening-answer-form-values";

/** Why a field can't be saved yet, keyed by the field. */
export type ScreeningAnswerFormProblems = Partial<Record<keyof ScreeningAnswerFormValues, string>>;
