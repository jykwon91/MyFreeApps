import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import { reagentSourcesFor } from "@/games/wow-forever/data/food/recipeSourceData";
import { hasSources, unknownSource } from "@/games/wow-forever/food/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { FoodReagent } from "@/games/wow-forever/types/food";

interface FoodReagentRowProps {
  reagent: FoodReagent;
  faction: PlayerFaction;
  zoneId: number | null;
}

/** "1× Stringy Vulture Meat" and where to get it. */
export default function FoodReagentRow({ reagent, faction, zoneId }: FoodReagentRowProps) {
  const sources = reagentSourcesFor(reagent.id);
  return (
    <li className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">
        {reagent.count}× {reagent.name}
      </h3>
      {hasSources(sources) ? (
        <FoodSourceList sources={sources} faction={faction} zoneId={zoneId} preferEasySources />
      ) : (
        <p className="text-sm text-muted-foreground">{unknownSource(reagent.id, "it")}</p>
      )}
    </li>
  );
}
