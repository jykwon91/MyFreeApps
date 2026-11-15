import type { InsurancePolicyFormProblem } from "./insurance-policy-form-problem";
import type { InsurancePolicyFormValues } from "./insurance-policy-form-values";

/** The fields of the policy form that fail a check; a field that is fine is absent. */
export type InsurancePolicyFormProblems = Partial<Record<keyof InsurancePolicyFormValues, InsurancePolicyFormProblem>>;
