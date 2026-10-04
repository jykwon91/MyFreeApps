import FoodContainerList from "@/games/wow-forever/components/food/detail/FoodContainerList";
import FoodDropList from "@/games/wow-forever/components/food/detail/FoodDropList";
import FoodQuestRow from "@/games/wow-forever/components/food/detail/FoodQuestRow";
import FoodVendorList from "@/games/wow-forever/components/food/detail/FoodVendorList";
import { isCommonDrop, questsFor, splitVendors } from "@/games/wow-forever/food/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";

const SHOWN_WATERS = 4;

interface FoodSourceListProps {
  sources: ItemSources;
  faction: PlayerFaction;
  zoneId: number | null;
  /**
   * A reagent you can buy, fish or open from a clam doesn't need a list of mobs that happen to drop it —
   * unless half the world drops it (cloth), which is the main way to get it.
   */
  preferEasySources?: boolean;
}

function joinCapped(names: readonly string[], cap: number): string {
  const more = names.length - cap;
  return more > 0 ? `${names.slice(0, cap).join(", ")} and ${more} more` : names.join(", ");
}

/** Every known source, in the order a player would try them: buy, quest, fish, open, farm. */
export default function FoodSourceList({ sources, faction, zoneId, preferEasySources = false }: FoodSourceListProps) {
  const quests = questsFor(sources.quests, faction);
  const sold = splitVendors(sources.vendors, faction, zoneId).yours.length > 0;
  const easy = sold || sources.fishing.length > 0 || sources.containers.length > 0;
  const hideDrop = preferEasySources && easy && !(sources.drop && isCommonDrop(sources.drop));
  const drop = hideDrop ? null : sources.drop;
  return (
    <div className="space-y-3">
      {sources.vendors.length ? <FoodVendorList vendors={sources.vendors} faction={faction} zoneId={zoneId} /> : null}
      {quests.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Quest reward</p>
          <ul className="space-y-2">
            {quests.map((q) => (
              <FoodQuestRow key={q.id} quest={q} />
            ))}
          </ul>
        </div>
      ) : null}
      {sources.fishing.length ? (
        <p className="text-sm">
          <span className="font-medium">Fish for it in</span> {joinCapped(sources.fishing, SHOWN_WATERS)}.
        </p>
      ) : null}
      {sources.containers.length ? <FoodContainerList sources={sources} faction={faction} zoneId={zoneId} /> : null}
      {drop ? <FoodDropList drop={drop} faction={faction} zoneId={zoneId} /> : null}
    </div>
  );
}
