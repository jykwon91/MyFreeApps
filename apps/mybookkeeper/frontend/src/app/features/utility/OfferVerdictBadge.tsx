import type { OfferVerdict } from "@/shared/types/utility/offer-verdict";

export interface OfferVerdictBadgeProps {
  verdict: OfferVerdict;
}

const LABEL: Record<OfferVerdict, string> = {
  major: "Big upgrade",
  solid: "Upgrade",
  slight: "Slight upgrade",
  conditional: "Conditional",
};

const TONE: Record<OfferVerdict, string> = {
  major: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  solid: "bg-green-50 text-green-800 dark:bg-green-900/25 dark:text-green-200",
  slight: "bg-muted text-muted-foreground",
  conditional: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
};

/**
 * The one-word answer to "is this better than what I have".
 *
 * A word rather than a colour: "Conditional" says something a yellow pill on
 * its own cannot, and it is the case most worth being explicit about — a
 * bill-credit plan can post the biggest saving on the board while only holding
 * it inside a narrow band of usage.
 */
export default function OfferVerdictBadge({ verdict }: OfferVerdictBadgeProps) {
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE[verdict]}`}
    >
      {LABEL[verdict]}
    </span>
  );
}
