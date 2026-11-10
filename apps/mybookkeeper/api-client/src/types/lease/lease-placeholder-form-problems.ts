import type { LEASE_PLACEHOLDER_FORM_PROBLEMS } from "../../constants/leasePlaceholderForm";

export type LeasePlaceholderFormProblem = keyof typeof LEASE_PLACEHOLDER_FORM_PROBLEMS;

/** Fields that can't be saved as they are, each with the reason. */
export interface LeasePlaceholderFormProblems {
  display_label?: LeasePlaceholderFormProblem;
  default_source?: LeasePlaceholderFormProblem;
}
