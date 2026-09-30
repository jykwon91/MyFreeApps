import FoodReagentRow from "@/games/wow-forever/components/food/detail/FoodReagentRow";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { FoodReagent } from "@/games/wow-forever/types/food";

interface FoodReagentsSectionProps {
  reagents: readonly FoodReagent[];
  faction: PlayerFaction;
  zoneId: number | null;
}

/** What goes into one — each ingredient with where to get it. */
export default function FoodReagentsSection({ reagents, faction, zoneId }: FoodReagentsSectionProps) {
  if (reagents.length === 0) return null;
  return (
    <section aria-labelledby="food-reagents" className={DETAIL_SECTION}>
      <h2 id="food-reagents" className="text-base font-semibold">
        What you need
      </h2>
      <ul className="space-y-3">
        {reagents.map((r) => (
          <FoodReagentRow key={r.id} reagent={r} faction={faction} zoneId={zoneId} />
        ))}
      </ul>
    </section>
  );
}
