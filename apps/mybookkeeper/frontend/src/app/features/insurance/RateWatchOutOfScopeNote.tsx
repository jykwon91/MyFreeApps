import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";

export interface RateWatchOutOfScopeNoteProps {
  outlooks: InsurancePolicyRateOutlook[];
}

/**
 * The policies this feed was never going to cover.
 *
 * Named rather than hidden — a policy silently missing from the list would be
 * worse than one explained — but as a footnote, not a card. The first cut gave
 * a homeowners policy a full-size card reading "No dwelling-line filings found
 * under this carrier's name", which both outweighed the card that had an answer
 * and claimed a search that never ran.
 */
export default function RateWatchOutOfScopeNote({
  outlooks,
}: RateWatchOutOfScopeNoteProps) {
  if (outlooks.length === 0) return null;

  const names = outlooks
    .map((outlook) => outlook.property_name ?? outlook.policy_label)
    .join(", ");

  return (
    <p
      className="text-xs text-muted-foreground"
      data-testid="rate-watch-out-of-scope"
    >
      Not checked: {names}. Texas publishes rate filings for landlord
      (dwelling-fire) policies only, so a homeowners policy has nothing to
      compare against here.
    </p>
  );
}
