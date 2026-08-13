import { formatCurrency } from "@/shared/utils/currency";
import type { InsurancePremiumFrequency } from "@/shared/types/insurance/insurance-premium-frequency";

/**
 * Display helpers for insurance-policy figures.
 *
 * ``wind_hail_deductible_pct`` arrives as a JSON *string* (``"2.00"``) because
 * the backend column is ``Numeric`` — Pydantic serializes Decimal as a string to
 * avoid a float round-trip. This module is the only place that string is parsed.
 */

/** How each frequency reads next to an amount. */
const FREQUENCY_SUFFIX: Record<InsurancePremiumFrequency, string> = {
  annual: "/yr",
  semiannual: "/6mo",
  quarterly: "/qtr",
  monthly: "/mo",
};

/** Sentence-case labels for the frequency picker. */
export const FREQUENCY_LABEL: Record<InsurancePremiumFrequency, string> = {
  annual: "Annually",
  semiannual: "Every 6 months",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

/** Integer cents → ``"$1,240"``. Whole dollars — premiums are never quoted finer. */
export function formatPolicyMoney(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * The premium as billed — ``"$112/mo"``.
 *
 * Always carries its period. A bare "$112" beside a "$1,240" invites the reader
 * to treat one as twelve times cheaper than the other when they may be the same
 * policy on different payment plans.
 */
export function formatBilledPremium(
  cents: number | null,
  frequency: InsurancePremiumFrequency | null,
): string {
  if (cents === null || frequency === null) return "—";
  return `${formatPolicyMoney(cents)}${FREQUENCY_SUFFIX[frequency]}`;
}

/** Annualised premium → ``"$1,344/yr"``. */
export function formatAnnualPremium(cents: number | null): string {
  if (cents === null) return "—";
  return `${formatPolicyMoney(cents)}/yr`;
}

/**
 * Wind/hail deductible → ``"2% of coverage"``, with the dollar figure when the
 * coverage amount is known.
 *
 * A percentage alone understates the exposure: 2% reads as small until it is
 * priced against a $500,000 dwelling and turns into $10,000 out of pocket.
 */
export function formatWindHailDeductible(
  pct: string | null,
  coverageAmountCents: number | null,
): string {
  if (pct === null || pct.trim() === "") return "—";
  const parsed = Number(pct);
  if (!Number.isFinite(parsed)) return "—";
  const label = `${parsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}% of coverage`;
  if (!coverageAmountCents) return label;
  const dollars = formatCurrency(
    Math.round((coverageAmountCents * parsed) / 100) / 100,
  );
  return `${label} (${dollars})`;
}
