import EquippedPlanCard from "@/app/features/utility/EquippedPlanCard";
import OfferTierCard from "@/app/features/utility/OfferTierCard";
import { bestSavingCents } from "@/shared/lib/offer-stats";
import { buildOfferTiers } from "@/shared/lib/offer-tiers";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

export interface BetterPlansGroupProps {
  group: UtilityOfferGroup;
  referenceAnnualKwh: number;
}

/**
 * One property's comparison: what it holds now, and what it could hold instead.
 *
 * The current plan sits in its own rail rather than a caption line because every
 * figure to its right is a movement against it — and on a wide screen it stays
 * put while the candidates scroll past, so the baseline never leaves view.
 */
export default function BetterPlansGroup({
  group,
  referenceAnnualKwh,
}: BetterPlansGroupProps) {
  const tiers = buildOfferTiers(group.offers);
  const maxSaving = bestSavingCents(group);

  return (
    <section
      className="rounded-lg border border-border p-4"
      data-testid={`better-plans-group-${group.property_id}`}
    >
      <h3 className="text-sm font-semibold">
        {group.property_name ?? "Unknown property"}
      </h3>

      <div className="mt-3 lg:flex lg:gap-4 lg:items-start">
        <div className="lg:w-60 lg:shrink-0 lg:sticky lg:top-4">
          <EquippedPlanCard group={group} referenceAnnualKwh={referenceAnnualKwh} />
        </div>

        <div className="flex-1 min-w-0 mt-3 lg:mt-0">
          {group.unavailable_reason ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid={`better-plans-unavailable-${group.property_id}`}
            >
              {group.unavailable_reason}
            </p>
          ) : null}

          {tiers.length > 0 ? (
            <ul className="space-y-3">
              {tiers.map((tier, index) => (
                <OfferTierCard
                  key={tier.key}
                  tier={tier}
                  group={group}
                  referenceAnnualKwh={referenceAnnualKwh}
                  maxSavingCents={maxSaving}
                  isBest={index === 0}
                />
              ))}
            </ul>
          ) : null}

          {/* Named rather than silent: a shorter list with no explanation reads
              as "this is the whole market", which it is not. */}
          {group.withheld_low_rated_count > 0 ? (
            <p
              className="text-xs text-muted-foreground mt-3"
              data-testid={`better-plans-withheld-${group.property_id}`}
            >
              {group.withheld_low_rated_count} cheaper{" "}
              {group.withheld_low_rated_count === 1 ? "offer" : "offers"} hidden —
              poorly rated or unrated providers.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
