import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import { POLICY_FORM_MESSAGES } from "../../constants/insuranceForm";
import type { PolicyFormErrors } from "../../types/PolicyFormErrors";

function isNegativeOrUnreadable(text: string): boolean {
  if (text.trim() === "") return false;
  const parsed = Number(text);
  return !Number.isFinite(parsed) || parsed < 0;
}

/** Checked before anything is sent, so a typo gets pointed at instead of bouncing off the server. */
export function policyFormErrors(values: InsurancePolicyFormValues, propertyId: string | null): PolicyFormErrors {
  const errors: PolicyFormErrors = {};
  if (propertyId !== null && propertyId === "") errors.propertyId = POLICY_FORM_MESSAGES.propertyRequired;
  if (values.policyName.trim() === "") errors.policyName = POLICY_FORM_MESSAGES.policyNameRequired;
  const money = ["coverageDollars", "premiumDollars", "feesAndTaxesDollars", "deductibleDollars"] as const;
  for (const field of money) {
    if (isNegativeOrUnreadable(values[field])) errors[field] = POLICY_FORM_MESSAGES.amountInvalid;
  }
  const windHail = values.windHailPct.trim();
  if (windHail !== "" && (isNegativeOrUnreadable(windHail) || Number(windHail) > 100)) {
    errors.windHailPct = POLICY_FORM_MESSAGES.windHailInvalid;
  }
  if (values.effectiveDate && values.expirationDate && values.expirationDate < values.effectiveDate) {
    errors.expirationDate = POLICY_FORM_MESSAGES.datesOrder;
  }
  return errors;
}
