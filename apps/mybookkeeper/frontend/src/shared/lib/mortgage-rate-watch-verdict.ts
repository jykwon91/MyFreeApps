import {
  formatBreakeven,
  formatMoneyBand,
  formatRateBand,
  formatRatePct,
} from "@/shared/lib/mortgage-format";
import type { MortgageRateWatch } from "@/shared/types/mortgage/mortgage-rate-watch";
import type { MortgageRateWatchVerdict } from "@/shared/types/mortgage/mortgage-rate-watch-verdict";
import type { MortgageRefiOutlook } from "@/shared/types/mortgage/mortgage-refi-outlook";

/**
 * Reduce the whole rate-watch payload to the sentence it leads with.
 *
 * Returns null only when there is genuinely no verdict to give — the feed was
 * unreachable, or nothing was checked. Both are stated elsewhere as what they
 * are; neither may be dressed up here as an all-clear.
 *
 * Only ``worth_pricing`` raises the tone. A ``marginal`` loan still gets named,
 * because a rate gap the operator can see on their own statement deserves an
 * explanation rather than silence — but it is not an action item, and rendering
 * it in the alert tone would send them to a lender over a loan that does not
 * pay back.
 */
export function buildMortgageRateWatchVerdict(
  data: MortgageRateWatch,
): MortgageRateWatchVerdict | null {
  if (data.feed_unavailable_reason !== null) return null;
  if (data.checked_mortgage_count === 0) return null;

  const worthPricing = bestByVerdict(data.outlooks, "worth_pricing");
  if (worthPricing !== null) return pricingVerdict(worthPricing);

  const marginal = bestByVerdict(data.outlooks, "marginal");
  if (marginal !== null) return marginalVerdict(marginal);

  const n = data.checked_mortgage_count;
  return {
    tone: "clear",
    headline: `Nothing worth refinancing across ${
      n === 1 ? "your loan" : `your ${n} loans`
    }.`,
    detail:
      "Every rate on record is at or below what a comparable loan is going " +
      "for this week, once the survey average is adjusted for how each " +
      "property is used.",
  };
}

/**
 * The loan with the largest guaranteed saving at a given verdict.
 *
 * Ranked on ``monthly_saving_low_cents`` — the conservative end — so the loan
 * that leads is the one whose case holds up even if the comparable rate lands
 * at the top of its band.
 *
 * Exported because the action line has to name the same loan the headline
 * names. Deriving it twice from the same array is how a callout and a headline
 * end up quoting different properties.
 */
export function bestByVerdict(
  outlooks: MortgageRefiOutlook[],
  verdict: MortgageRefiOutlook["verdict"],
): MortgageRefiOutlook | null {
  let best: MortgageRefiOutlook | null = null;
  for (const outlook of outlooks) {
    if (outlook.verdict !== verdict) continue;
    const saving = outlook.monthly_saving_low_cents ?? 0;
    if (best === null || saving > (best.monthly_saving_low_cents ?? 0)) {
      best = outlook;
    }
  }
  return best;
}

function pricingVerdict(best: MortgageRefiOutlook): MortgageRateWatchVerdict {
  const saving = formatMoneyBand(
    best.monthly_saving_low_cents,
    best.monthly_saving_high_cents,
  );
  return {
    tone: "alert",
    headline: `Your ${best.property_name} loan is worth pricing — about ${saving} a month.`,
    detail: [
      `You're at ${formatRatePct(best.current_rate_pct)} against a comparable `,
      `${formatRateBand(best.comparable_rate_low_pct, best.comparable_rate_high_pct)} `,
      `this week, and closing costs of ${formatMoneyBand(
        best.closing_cost_low_cents,
        best.closing_cost_high_cents,
      )} `,
      `earn back in ${breakevenPhrase(best)}.`,
    ].join(""),
  };
}

function marginalVerdict(best: MortgageRefiOutlook): MortgageRateWatchVerdict {
  return {
    tone: "clear",
    headline: `Your ${best.property_name} rate is above the market, but not by enough to be worth refinancing.`,
    detail: [
      `${formatRatePct(best.current_rate_pct)} against a comparable `,
      `${formatRateBand(best.comparable_rate_low_pct, best.comparable_rate_high_pct)}. `,
      `Saving ${formatMoneyBand(
        best.monthly_saving_low_cents,
        best.monthly_saving_high_cents,
      )} a month against ${formatMoneyBand(
        best.closing_cost_low_cents,
        best.closing_cost_high_cents,
      )} to close means ${breakevenPhrase(best)} before you're ahead.`,
    ].join(""),
  };
}

function breakevenPhrase(outlook: MortgageRefiOutlook): string {
  return formatBreakeven(
    outlook.breakeven_low_months,
    outlook.breakeven_high_months,
  );
}
