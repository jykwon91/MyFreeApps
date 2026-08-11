import StatDelta from "@/app/features/utility/StatDelta";
import type { OfferStat } from "@/shared/types/utility/offer-stat";

export interface OfferStatGridProps {
  stats: OfferStat[];
}

/**
 * The offer's stat block, one column per stat.
 *
 * Fixed columns rather than a sentence so the eye can track a single stat down
 * the page across every candidate — the comparison the operator is making runs
 * vertically, not horizontally.
 */
export default function OfferStatGrid({ stats }: OfferStatGridProps) {
  return (
    <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3">
      {stats.map((stat) => (
        <div key={stat.key} aria-label={stat.hint} title={stat.hint}>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="text-sm font-medium mt-0.5">{stat.value}</dd>
          {stat.delta ? (
            <dd className="mt-0.5">
              <StatDelta direction={stat.direction} delta={stat.delta} />
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
