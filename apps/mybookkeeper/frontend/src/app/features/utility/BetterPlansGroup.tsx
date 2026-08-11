import BetterPlanRow from "@/app/features/utility/BetterPlanRow";
import { formatCents } from "@/shared/lib/utility-plan-format";
import { formatOfferRate } from "@/shared/lib/utility-offer-format";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

export interface BetterPlansGroupProps {
  group: UtilityOfferGroup;
}

function CurrentPlanLine({ group }: BetterPlansGroupProps) {
  if (group.current_price_cents_per_kwh_at_1000 === null) return null;
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      Currently {group.current_provider_name} at{" "}
      {formatOfferRate(group.current_price_cents_per_kwh_at_1000)}/kWh
      {group.switch_cost_cents === null
        ? " · exit fee unknown"
        : ` · ${formatCents(group.switch_cost_cents)} to leave early`}
    </p>
  );
}

export default function BetterPlansGroup({ group }: BetterPlansGroupProps) {
  return (
    <section
      className="rounded-lg border border-border p-4"
      data-testid={`better-plans-group-${group.property_id}`}
    >
      <header>
        <h3 className="text-sm font-semibold">
          {group.property_name ?? "Unknown property"}
        </h3>
        <CurrentPlanLine group={group} />
      </header>

      {group.unavailable_reason ? (
        <p
          className="text-sm text-muted-foreground mt-3"
          data-testid={`better-plans-unavailable-${group.property_id}`}
        >
          {group.unavailable_reason}
        </p>
      ) : null}

      {group.offers.length > 0 ? (
        <ul className="mt-2">
          {group.offers.map((offer) => (
            <BetterPlanRow key={offer.external_plan_id} offer={offer} />
          ))}
        </ul>
      ) : null}

      {/* Named rather than silent: a shorter list with no explanation reads as
          "this is the whole market", which it is not. */}
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
    </section>
  );
}
