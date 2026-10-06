import FoodDropList from "@/games/wow-forever/components/food/detail/FoodDropList";
import FoodObjectSpotRow from "@/games/wow-forever/components/food/detail/FoodObjectSpotRow";
import { hostileGroundLabel } from "@/games/wow-forever/food/recipeSources";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface FoodContainerListProps {
  sources: Pick<ItemSources, "containers" | "objectSpots" | "containerDrops">;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
}

/**
 * Clams, herbs and crates that hold it — and where: the zones with the most
 * of them on the ground, or the mobs that drop the clam. A chest with no
 * fixed spot is only named.
 */
export default function FoodContainerList({ sources, faction, zoneId, level }: FoodContainerListProps) {
  const { containers, objectSpots, containerDrops } = sources;
  const severalKinds = containers.length > 1;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="font-medium">Found in</span> {containers.join(", ")}.
      </p>
      {objectSpots.length ? (
        <ul className="space-y-2" aria-label="Where to find them">
          {objectSpots.map((o) => (
            <FoodObjectSpotRow key={`${o.name}-${o.spot.zoneId}`} object={o} named={severalKinds} warning={hostileGroundLabel(o.spot, faction)} />
          ))}
        </ul>
      ) : null}
      {containerDrops.map(({ name, drop }) => (
        <div key={name} className="space-y-2">
          <p className="text-sm">
            <span className="font-medium">{name}</span>{" "}
            <span className="text-muted-foreground">— open it from your bags.</span>
          </p>
          <FoodDropList drop={drop} faction={faction} zoneId={zoneId} level={level} />
        </div>
      ))}
    </div>
  );
}
