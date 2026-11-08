import RacialVariantLines from "@/games/wow-forever/components/races/RacialVariantLines";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RACE_COMPARE_COLUMNS } from "@/games/wow-forever/data/races/racesConfig";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { RacialVariant } from "@/games/wow-forever/types/races/racialVariant";

interface RacialCompareProps {
  classic: readonly RacialVariant[];
  forever: readonly RacialVariant[];
}

/** A changed racial's Classic Era text next to Forever's: two columns from `sm`, stacked on a phone. */
export default function RacialCompare({ classic, forever }: RacialCompareProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="racial-compare">
      <div className="space-y-1 rounded-md border p-2">
        <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {RACE_COMPARE_COLUMNS.classic} <ProvenanceBadge provenance={PROVENANCE.classic} />
        </p>
        <RacialVariantLines variants={classic} />
      </div>
      <div className="space-y-1 rounded-md border p-2">
        <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {RACE_COMPARE_COLUMNS.forever} <ProvenanceBadge provenance={PROVENANCE.client} />
        </p>
        <RacialVariantLines variants={forever} />
      </div>
    </div>
  );
}
