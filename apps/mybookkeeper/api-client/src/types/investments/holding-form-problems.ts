import type { HoldingFormProblem } from "./holding-form-problem";
import type { HoldingFormValues } from "./holding-form-values";

export type HoldingFormProblems = Partial<Record<keyof HoldingFormValues, HoldingFormProblem>>;
