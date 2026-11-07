import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { FOOD_DATA_BUILD } from "@/games/wow-forever/data/food/foodData";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Where the numbers come from and what isn't known yet. One note, under the results. */
export default function FoodDataNote({ weightsLabel }: { weightsLabel: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground">
      <p>
        Food effects are read from the Forever client (build {FOOD_DATA_BUILD}) and may change. Stat buffs are
        ranked with {weightsLabel}. Only one Well Fed buff is active at a time (the Classic rule).
      </p>
      <p>
        Well Fed from most cooked food also gives +5% XP from kills. What else it needs isn't published.{" "}
        <ProvenanceBadge provenance={PROVENANCE.unconfirmed} />
      </p>
      <p>
        Cooking skill for trainer recipes: <ProvenanceBadge provenance={PROVENANCE.classic} /> Recipe skill comes from the
        Forever recipe items.
      </p>
    </aside>
  );
}
