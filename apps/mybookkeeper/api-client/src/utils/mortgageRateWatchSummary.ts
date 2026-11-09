import type { MortgageRateWatch } from "../types/mortgage/mortgage-rate-watch";
import { formatLoanDate, formatRatePct } from "./mortgageFormat";

/** How many of the listed loans were actually compared, stated plainly. */
export function mortgageScopeSummary(total: number, checked: number): string {
  if (total === checked) {
    return `Compared ${checked === 1 ? "your loan" : `all ${checked} of your loans`} against this week's averages.`;
  }
  const skipped = total - checked;
  return (
    `Compared ${checked} of your ${total} loans against this week's averages. ` +
    `The other ${skipped === 1 ? "one says" : `${skipped} say`} below why ` +
    `${skipped === 1 ? "it" : "they"} couldn't be.`
  );
}

/** The survey the comparison was measured against, or null when the feed gave no date. */
export function mortgageSurveyLine(data: MortgageRateWatch): string | null {
  if (!data.survey_observed_on) return null;
  return (
    `Freddie Mac's weekly survey for ${formatLoanDate(data.survey_observed_on)}: ` +
    `${formatRatePct(data.survey_30_year_pct)} on a 30-year fixed, ` +
    `${formatRatePct(data.survey_15_year_pct)} on a 15-year. ` +
    "That survey measures owner-occupied homes, so a loan on a rental or a second home " +
    "is compared against it plus 0.4 to 0.85 points — roughly what the " +
    "agencies charge for the difference. None of this is a quote; only a " +
    "lender can give you one."
  );
}
