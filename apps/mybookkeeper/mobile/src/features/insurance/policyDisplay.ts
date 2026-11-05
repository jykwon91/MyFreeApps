import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";
import { EXPIRES_SOON_DAYS } from "../../constants/insurance";
import { dateFromIso, fullDateLabel } from "../../lib/localDate";

const MS_PER_DAY = 86_400_000;

function daysUntil(iso: string, todayIso: string): number {
  return Math.round((dateFromIso(iso).getTime() - dateFromIso(todayIso).getTime()) / MS_PER_DAY);
}

/** Null while a policy has a good while left, so a chip always means look at this. */
export function expiryLabel(expirationDate: string | null, todayIso: string): string | null {
  if (!expirationDate) return null;
  const days = daysUntil(expirationDate, todayIso);
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return "Expired yesterday";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return days <= EXPIRES_SOON_DAYS ? `Expires in ${days} days` : null;
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
  return [policy.policy_name, policy.property_name, policy.carrier, expiryLabel(policy.expiration_date, todayIso)]
    .filter(Boolean)
    .join(", ");
}

export function policyTerm(effectiveDate: string | null, expirationDate: string | null): string | null {
  if (effectiveDate && expirationDate) return `${fullDateLabel(effectiveDate)} to ${fullDateLabel(expirationDate)}`;
  if (expirationDate) return `Ends ${fullDateLabel(expirationDate)}`;
  return effectiveDate ? `Starts ${fullDateLabel(effectiveDate)}` : null;
}
