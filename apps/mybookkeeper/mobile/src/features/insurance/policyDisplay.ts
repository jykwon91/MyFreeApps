import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";
import { formatAnnualPremium } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { EXPIRES_SOON_DAYS, EXPIRY_MESSAGES } from "../../constants/insurance";
import { daysBetween, fullDateLabel } from "../../lib/localDate";

/** Null while a policy has a good while left, so a chip always means look at this. */
export function expiryLabel(expirationDate: string | null, todayIso: string): string | null {
  if (!expirationDate) return null;
  const days = daysBetween(todayIso, expirationDate);
  if (days < -1) return EXPIRY_MESSAGES.expiredDaysAgo(-days);
  if (days === -1) return EXPIRY_MESSAGES.expiredYesterday;
  if (days === 0) return EXPIRY_MESSAGES.expiresToday;
  if (days === 1) return EXPIRY_MESSAGES.expiresTomorrow;
  return days <= EXPIRES_SOON_DAYS ? EXPIRY_MESSAGES.expiresInDays(days) : null;
}

function sortGroup(policy: InsurancePolicySummary, todayIso: string): number {
  if (!policy.expiration_date) return 1;
  return policy.expiration_date < todayIso ? 2 : 0;
}

/** Whatever is running out first, then policies with no end date, then the most recently expired. */
export function sortedPolicies<Policy extends InsurancePolicySummary>(policies: readonly Policy[], todayIso: string): Policy[] {
  return [...policies].sort((a, b) => {
    const group = sortGroup(a, todayIso) - sortGroup(b, todayIso);
    if (group !== 0) return group;
    const byDate = (a.expiration_date ?? "").localeCompare(b.expiration_date ?? "");
    if (byDate !== 0) return sortGroup(a, todayIso) === 2 ? -byDate : byDate;
    return a.policy_name.localeCompare(b.policy_name);
  });
}

export function policyPlace(policy: { property_name: string | null; carrier: string | null }): string | null {
  return [policy.property_name, policy.carrier].filter(Boolean).join(" · ") || null;
}

export function policyRowLabel(policy: InsurancePolicySummary, todayIso: string): string {
  return [policy.policy_name, policy.property_name, policy.carrier, policy.annual_premium_cents === null ? null : formatAnnualPremium(policy.annual_premium_cents), expiryLabel(policy.expiration_date, todayIso)]
    .filter(Boolean)
    .join(", ");
}

export function policyTerm(effectiveDate: string | null, expirationDate: string | null): string | null {
  if (effectiveDate && expirationDate) return `${fullDateLabel(effectiveDate)} to ${fullDateLabel(expirationDate)}`;
  if (expirationDate) return `Ends ${fullDateLabel(expirationDate)}`;
  return effectiveDate ? `Starts ${fullDateLabel(effectiveDate)}` : null;
}
