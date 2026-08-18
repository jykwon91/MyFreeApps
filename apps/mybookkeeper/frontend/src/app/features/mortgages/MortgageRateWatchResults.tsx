import AlertBox from "@/shared/components/ui/AlertBox";
import { formatLoanDate, formatRatePct } from "@/shared/lib/mortgage-format";
import { buildMortgageRateWatchVerdict } from "@/shared/lib/mortgage-rate-watch-verdict";
import type { MortgageRateWatch } from "@/shared/types/mortgage/mortgage-rate-watch";
import MortgageOutlookCard from "./MortgageOutlookCard";
import MortgageRateWatchVerdictBanner from "./MortgageRateWatchVerdictBanner";

export interface MortgageRateWatchResultsProps {
  data: MortgageRateWatch;
  /** Re-runs the check after a blocker on a card has been cleared. */
  onRecheck: () => void;
}

/** How many of the listed loans were actually compared, stated plainly. */
function scopeSummary(total: number, checked: number): string {
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

/**
 * The loaded section, in the order it should be read.
 *
 * Verdict, then what was compared, then every loan it came from, then the
 * benchmark it was measured against.
 *
 * The scope line is stated before the cards rather than inferred from them.
 * That is the line answering "why is only one of these compared" — the count is
 * the section's own account of what it did, not something the reader has to
 * total up from the cards.
 */
export default function MortgageRateWatchResults({
  data,
  onRecheck,
}: MortgageRateWatchResultsProps) {
  const verdict = buildMortgageRateWatchVerdict(data);

  return (
    <div className="space-y-4" data-testid="mortgage-rate-watch-results">
      {data.feed_unavailable_reason ? (
        <AlertBox variant="warning">{data.feed_unavailable_reason}</AlertBox>
      ) : null}

      {verdict ? <MortgageRateWatchVerdictBanner verdict={verdict} /> : null}

      {data.outlooks.length > 0 ? (
        <>
          <p
            className="text-sm text-muted-foreground"
            data-testid="mortgage-rate-watch-scope"
          >
            {scopeSummary(data.outlooks.length, data.checked_mortgage_count)}
          </p>

          <ul className="space-y-3">
            {data.outlooks.map((outlook) => (
              <MortgageOutlookCard
                key={outlook.mortgage_id}
                outlook={outlook}
                onRecheck={onRecheck}
              />
            ))}
          </ul>
        </>
      ) : null}

      {data.survey_observed_on ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="mortgage-rate-watch-survey"
        >
          Freddie Mac&apos;s weekly survey for{" "}
          {formatLoanDate(data.survey_observed_on)}:{" "}
          {formatRatePct(data.survey_30_year_pct)} on a 30-year fixed,{" "}
          {formatRatePct(data.survey_15_year_pct)} on a 15-year. That survey
          measures owner-occupied homes, so a loan on a rental or a second home
          is compared against it plus 0.4 to 0.85 points — roughly what the
          agencies charge for the difference. None of this is a quote; only a
          lender can give you one.
        </p>
      ) : null}
    </div>
  );
}
