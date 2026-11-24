import type { FinancialAccountFormProblem } from "./financial-account-form-problem";
import type { FinancialAccountFormValues } from "./financial-account-form-values";

export type FinancialAccountFormProblems = Partial<Record<keyof FinancialAccountFormValues, FinancialAccountFormProblem>>;
