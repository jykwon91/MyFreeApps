import { AlertBox } from "@platform/ui";
import { mortgageScopeSummary, mortgageSurveyLine } from "@mybookkeeper/api-client/utils/mortgageRateWatchSummary";
import { buildMortgageRateWatchVerdict } from "@mybookkeeper/api-client/utils/mortgageRateWatchVerdict";
import type { MortgageRateWatch } from "@mybookkeeper/api-client/types/mortgage/mortgage-rate-watch";
import MortgageOutlookCard from "./MortgageOutlookCard";
import MortgageRateWatchVerdictBanner from "./MortgageRateWatchVerdictBanner";

export interface MortgageRateWatchResultsProps {
  data: MortgageRateWatch;
  /** Re-runs the check after a blocker on a card has been cleared. */
  onRecheck: () => void;
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
  const surveyLine = mortgageSurveyLine(data);

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
            {mortgageScopeSummary(data.outlooks.length, data.checked_mortgage_count)}
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

      {surveyLine ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="mortgage-rate-watch-survey"
        >
          {surveyLine}
        </p>
      ) : null}
    </div>
  );
}
