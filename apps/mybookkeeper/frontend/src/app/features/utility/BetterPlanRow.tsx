import {
  formatAnnualSaving,
  formatCancellationFee,
  formatOfferRate,
  formatProviderRating,
  formatTerm,
} from "@/shared/lib/utility-offer-format";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

export interface BetterPlanRowProps {
  offer: UtilityOffer;
}

export default function BetterPlanRow({ offer }: BetterPlanRowProps) {
  return (
    <li
      className="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0"
      data-testid={`better-plan-${offer.external_plan_id}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {offer.provider_name}
          <span className="text-muted-foreground font-normal">
            {" · "}
            {offer.plan_name}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatOfferRate(offer.price_cents_per_kwh_at_1000)}/kWh ·{" "}
          {formatTerm(offer.term_months)} ·{" "}
          {formatProviderRating(offer.provider_rating)} ·{" "}
          {formatCancellationFee(
            offer.cancellation_fee_cents,
            offer.cancellation_fee_is_per_remaining_month,
          )}
        </p>
        {/* All three disclosure points, because a single headline number is
            exactly what a bill-credit plan is designed to game. */}
        <p className="text-xs text-muted-foreground mt-0.5">
          At 500 / 1000 / 2000 kWh:{" "}
          {formatOfferRate(offer.price_cents_per_kwh_at_500)} /{" "}
          {formatOfferRate(offer.price_cents_per_kwh_at_1000)} /{" "}
          {formatOfferRate(offer.price_cents_per_kwh_at_2000)}
        </p>
        {offer.is_teaser_priced ? (
          <p
            className="text-xs mt-1 text-amber-700 dark:text-amber-300"
            data-testid={`better-plan-teaser-${offer.external_plan_id}`}
          >
            The low rate here only holds near 1,000 kWh — a bill credit props it
            up, and usage either side of that band costs more.
          </p>
        ) : null}
        <p className="text-xs mt-1 flex gap-3">
          {offer.fact_sheet_url ? (
            <a
              href={offer.fact_sheet_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              Facts label
            </a>
          ) : null}
          {offer.enroll_url ? (
            <a
              href={offer.enroll_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              Sign up
            </a>
          ) : null}
        </p>
      </div>
      <span
        className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
        data-testid={`better-plan-saving-${offer.external_plan_id}`}
      >
        {formatAnnualSaving(offer.annual_saving_cents)}
      </span>
    </li>
  );
}
