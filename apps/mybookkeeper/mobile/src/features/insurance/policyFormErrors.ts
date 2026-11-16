import { INSURANCE_POLICY_PROBLEM_MESSAGES } from "@mybookkeeper/api-client/constants/insurancePolicyProblemMessages";
import type { InsurancePolicyFormProblems } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-problems";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import { insurancePolicyFormProblems } from "@mybookkeeper/api-client/utils/insurancePolicyFormProblems";
import { POLICY_FORM_MESSAGES } from "../../constants/insuranceForm";
import type { PolicyFormErrors } from "../../types/PolicyFormErrors";

function messagesFor(problems: InsurancePolicyFormProblems): PolicyFormErrors {
  const errors: PolicyFormErrors = {};
  for (const field of Object.keys(problems) as (keyof InsurancePolicyFormProblems)[]) {
    const problem = problems[field];
    if (problem) errors[field] = INSURANCE_POLICY_PROBLEM_MESSAGES[problem];
  }
  return errors;
}

/**
 * Checked before anything is sent, so a typo gets pointed at instead of bouncing off the server.
 *
 * The rules are the shared ones the web form runs; only the property choice, which the phone
 * asks for on its own, is added here. Pass null for the property when it can't change (edit).
 */
export function policyFormErrors(values: InsurancePolicyFormValues, propertyId: string | null, decimalSeparator: DecimalSeparator): PolicyFormErrors {
  const errors = messagesFor(insurancePolicyFormProblems(values, decimalSeparator));
  if (propertyId !== null && propertyId === "") errors.propertyId = POLICY_FORM_MESSAGES.propertyRequired;
  return errors;
}
