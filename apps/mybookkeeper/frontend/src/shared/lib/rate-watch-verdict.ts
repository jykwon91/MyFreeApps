import {
  formatChangePct,
  formatFilingDate,
  formatPremiumDelta,
} from "@/shared/lib/rate-filing-format";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";
import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";
import type { RateWatchVerdict } from "@/shared/types/insurance/rate-watch-verdict";

/**
 * Reduce the whole rate-watch payload to the sentence it leads with.
 *
 * Returns null only when there is genuinely no verdict to give — the feed was
 * unreachable, or nothing was checked. Both of those are stated elsewhere as
 * what they are; neither may be dressed up as an all-clear here.
 */
export function buildRateWatchVerdict(
  data: InsuranceMarketWatch,
): RateWatchVerdict | null {
  if (data.feed_unavailable_reason !== null) return null;
  if (data.checked_policy_count === 0) return null;

  if (!data.has_any_increase) {
    const n = data.checked_policy_count;
    return {
      tone: "clear",
      headline: `No rate increases filed against ${
        n === 1 ? "your policy" : `your ${n} policies`
      }.`,
      detail: null,
    };
  }

  const worst = worstOutlook(data.outlooks);
  if (worst === null) return null;

  const where = worst.property_name ?? worst.policy_label;
  const delta = formatPremiumDelta(
    worst.current_premium_cents,
    worst.projected_premium_cents,
  );

  return {
    tone: "alert",
    headline: delta
      ? `Your ${where} renewal is going up about ${delta}.`
      : `A rate increase is filed against your ${where} policy.`,
    detail: [
      `${worst.carrier ?? "The carrier"} filed ${formatChangePct(
        worst.projected_change_pct,
      )}`,
      worst.expiration_date
        ? `takes effect before your ${formatFilingDate(
            worst.expiration_date,
          )} renewal`
        : null,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

/** The policy facing the largest filed increase — the one worth naming. */
function worstOutlook(
  outlooks: InsurancePolicyRateOutlook[],
): InsurancePolicyRateOutlook | null {
  let worst: InsurancePolicyRateOutlook | null = null;
  for (const outlook of outlooks) {
    const pct = outlook.projected_change_pct;
    if (pct === null || pct <= 0) continue;
    if (worst === null || pct > (worst.projected_change_pct ?? 0)) {
      worst = outlook;
    }
  }
  return worst;
}
