import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";

/** Which fields of the policy form to flag, once the host has tried to save. */
export type PolicyFormErrors = Partial<Record<keyof InsurancePolicyFormValues | "propertyId", string>>;
