import BetterPlansGroup from "@/app/features/utility/BetterPlansGroup";
import BetterPlansSkeleton from "@/app/features/utility/BetterPlansSkeleton";
import { bestSavingCents } from "@/shared/lib/offer-stats";
import type { BetterPlansMode } from "@/shared/types/utility/better-plans-mode";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

/** Most money on the table first — that is the property worth acting on. */
function byBiggestSaving(groups: UtilityOfferGroup[]): UtilityOfferGroup[] {
  return [...groups].sort((a, b) => bestSavingCents(b) - bestSavingCents(a));
}

export interface BetterPlansBodyProps {
  mode: BetterPlansMode;
  groups: UtilityOfferGroup[];
  referenceAnnualKwh: number;
}

export default function BetterPlansBody({
  mode,
  groups,
  referenceAnnualKwh,
}: BetterPlansBodyProps) {
  switch (mode) {
    case "loading":
      return <BetterPlansSkeleton />;

    case "idle":
      return (
        <p className="text-sm text-muted-foreground" data-testid="better-plans-idle">
          Checks every offer currently listed on Power to Choose against what
          each property pays today.
        </p>
      );

    case "error":
      return (
        <p className="text-sm text-muted-foreground" data-testid="better-plans-error">
          Couldn't reach the offer feed. Nothing is wrong with your plans — try
          again shortly.
        </p>
      );

    case "empty":
      return (
        <p className="text-sm text-muted-foreground" data-testid="better-plans-empty">
          No electricity plans on file yet. Add one and we'll have something to
          compare the market against.
        </p>
      );

    case "results":
      return (
        <div className="space-y-4" data-testid="better-plans-results">
          {byBiggestSaving(groups).map((group) => (
            <BetterPlansGroup
              key={group.property_id}
              group={group}
              referenceAnnualKwh={referenceAnnualKwh}
            />
          ))}
          {/* Stated once, at the bottom: every saving above is arithmetic at
              this usage, not a forecast of a specific bill. */}
          <p className="text-xs text-muted-foreground">
            Savings are calculated at {referenceAnnualKwh.toLocaleString()} kWh
            per year, the disclosure basis every Texas plan publishes. Your
            actual bill depends on what you use.
          </p>
        </div>
      );
  }
}
