import { useState } from "react";
import FoodMobRow from "@/games/wow-forever/components/food/detail/FoodMobRow";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import {
  describeCommonDrop,
  describeRareDrop,
  farmSpots,
  hostileGroundLabel,
  isCommonDrop,
  isRareDrop,
  mobsForLevel,
} from "@/games/wow-forever/food/recipeSources";
import type { DropSource } from "@/games/wow-forever/types/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface FoodDropListProps {
  drop: DropSource;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
}

/** Farm spots / mobs shown before "Show more" — the best few, so a route row stays short. */
const SHOWN_FARM_SPOTS = 5;
const SHOWN_MOBS = 5;

/**
 * The mobs to farm, with directions. Cloth (hundreds of mobs) lists a farm
 * spot per zone, nearest to home first; anything else lists every mob that
 * drops it, each with its own chance, best to farm first; a rare or world drop
 * says only the levels and where.
 */
function mobsHeading(count: number, farmable: number, level: number | null): string {
  if (count === 1) return "Drops from";
  if (level === null) return `Drops from ${count} mobs, best to farm first`;
  if (farmable === 0) return `Drops from ${count} mobs, none you can farm at level ${level} yet`;
  return `Drops from ${count} mobs, highest drop chance you can farm at level ${level} first`;
}

export default function FoodDropList({ drop, faction, zoneId, level }: FoodDropListProps) {
  const [showAll, setShowAll] = useState(false);
  if (isRareDrop(drop)) return <p className="text-sm">{describeRareDrop(drop)}.</p>;
  if (isCommonDrop(drop)) {
    const spots = farmSpots(drop, faction, zoneId);
    const hidden = showAll ? 0 : Math.max(0, spots.length - SHOWN_FARM_SPOTS);
    return (
      <div className="space-y-2">
        <p className="text-sm">{describeCommonDrop(drop)}</p>
        <ul className="space-y-2" aria-label="Where to farm it">
          {spots.slice(0, spots.length - hidden).map((m) => (
            <FoodMobRow key={m.name} mob={m} warning={m.spot ? hostileGroundLabel(m.spot, faction) : ""} />
          ))}
        </ul>
        {hidden > 0 ? (
          <button type="button" className={DETAIL_LINK} onClick={() => setShowAll(true)}>
            Show {hidden} more farm spots
          </button>
        ) : null}
      </div>
    );
  }
  const ranked = mobsForLevel(drop.mobs, level);
  const farmable = ranked.filter((r) => !r.tooHigh).length;
  const hidden = showAll ? 0 : Math.max(0, ranked.length - SHOWN_MOBS);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{mobsHeading(ranked.length, farmable, level)}</p>
      <ul className="space-y-2" aria-label="Mobs that drop it">
        {ranked.slice(0, ranked.length - hidden).map(({ mob, tooHigh }) => (
          <FoodMobRow
            key={mob.name}
            mob={mob}
            warning={mob.spot ? hostileGroundLabel(mob.spot, faction) : ""}
            note={tooHigh ? `Too high for level ${level}` : ""}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className={DETAIL_LINK} onClick={() => setShowAll(true)}>
          Show {hidden} more mobs
        </button>
      ) : null}
      {drop.zones.length ? <p className="text-xs text-muted-foreground">Mostly in {drop.zones.join(", ")}.</p> : null}
    </div>
  );
}
