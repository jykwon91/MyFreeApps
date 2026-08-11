import { annualCostCents } from "@/shared/lib/offer-stats";
import { formatOfferRate, formatWholeDollars } from "@/shared/lib/utility-offer-format";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

export interface EquippedPlanCardProps {
  group: UtilityOfferGroup;
  referenceAnnualKwh: number;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * What the property is on today — the item every candidate is measured against.
 *
 * Given its own card rather than a caption line because every delta below is
 * relative to it: if the operator cannot see the baseline, an arrow saying
 * "5.77¢ less" is a number without a referent.
 *
 * The cost of leaving belongs here and not on the candidates. It is a property
 * of the plan being left, and repeating it on every offer would read as though
 * each offer carried its own version of it.
 */
export default function EquippedPlanCard({
  group,
  referenceAnnualKwh,
}: EquippedPlanCardProps) {
  const rate = group.current_price_cents_per_kwh_at_1000;
  const yearly = rate === null ? null : annualCostCents(rate, referenceAnnualKwh);

  return (
    <div
      className="rounded-lg border border-border bg-muted/40 p-3"
      data-testid={`equipped-plan-${group.property_id}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Currently on
      </p>
      <p className="text-sm font-semibold mt-0.5">
        {group.current_provider_name ?? "Unknown provider"}
      </p>
      <dl className="mt-3 grid grid-cols-3 lg:grid-cols-1 gap-x-4 gap-y-3">
        <Figure label="Rate" value={rate === null ? "—" : `${formatOfferRate(rate)}/kWh`} />
        <Figure
          label="Yearly cost"
          value={yearly === null ? "—" : formatWholeDollars(yearly)}
        />
        <Figure
          label="Cost to leave"
          value={
            group.switch_cost_cents === null
              ? "Not recorded"
              : formatWholeDollars(group.switch_cost_cents)
          }
        />
      </dl>
      {/* Naming the gap, and where to close it — the figure is missing because
          nobody typed it in, not because the plan has no exit fee. */}
      {group.switch_cost_cents === null ? (
        <p
          className="text-xs text-muted-foreground mt-3"
          data-testid={`equipped-plan-no-exit-fee-${group.property_id}`}
        >
          Add this plan's early termination fee to see what switching really
          costs.
        </p>
      ) : null}
    </div>
  );
}
