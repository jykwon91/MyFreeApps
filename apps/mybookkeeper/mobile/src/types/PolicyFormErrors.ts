/** Which fields of the policy form to flag, once the host has tried to save. */
export interface PolicyFormErrors {
  propertyId?: string;
  policyName?: string;
  coverageDollars?: string;
  premiumDollars?: string;
  premiumFrequency?: string;
  feesAndTaxesDollars?: string;
  deductibleDollars?: string;
  windHailPct?: string;
  expirationDate?: string;
}
