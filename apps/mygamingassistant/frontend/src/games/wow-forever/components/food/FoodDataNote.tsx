import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import { FOOD_DATA_BUILD } from "@/games/wow-forever/data/food/foodData";

/** Where the numbers come from and what isn't known yet. One note, under the results. */
export default function FoodDataNote({ weightsLabel }: { weightsLabel: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground">
      <p>
        Food effects are read from the Forever beta client (build {FOOD_DATA_BUILD}) and may change. Stat buffs are
        ranked with {weightsLabel}. Only one Well Fed buff is active at a time (the Classic rule).
      </p>
      <p>
        Well Fed from most cooked food also gives +5% XP from kills. What else it needs isn't published.{" "}
        <UnconfirmedChip />
      </p>
      <p>
        Cooking skill for trainer recipes is the Classic value — it may differ in Forever. Recipe skill comes from the
        Forever recipe items.
      </p>
    </aside>
  );
}
