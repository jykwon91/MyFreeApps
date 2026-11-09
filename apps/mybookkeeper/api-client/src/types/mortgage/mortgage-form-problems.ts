import type { MortgageFormProblem } from "./mortgage-form-problem";
import type { MortgageFormValues } from "./mortgage-form-values";

/** The fields that cannot be saved as they stand, each with why. */
export type MortgageFormProblems = Partial<Record<keyof MortgageFormValues, MortgageFormProblem>>;
