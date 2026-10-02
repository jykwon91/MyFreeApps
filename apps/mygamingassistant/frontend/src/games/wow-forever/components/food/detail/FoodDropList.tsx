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
} from "@/games/wow-forever/food/recipeSources";
import type { DropSource } from "@/games/wow-forever/types/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface FoodDropListProps {
  drop: DropSource;
  faction: PlayerFaction;
  zoneId: number | null;
}

/** Farm spots shown before "Show more" — the nearest few, so a route row stays short. */
const SHOWN_FARM_SPOTS = 5;

function otherMobs(more: number): string {
  if (more <= 0) return "";
  return more === 1 ? " 1 other mob drops it too." : ` ${more} other mobs drop it too.`;
}

/**
 * The best mobs to farm, with directions. Cloth (hundreds of mobs) lists a
 * farm spot per zone, nearest to home first; a rare or world drop says only
 * the levels and where.
 */
export default function FoodDropList({ drop, faction, zoneId }: FoodDropListProps) {
  const [allSpots, setAllSpots] = useState(false);
  if (isRareDrop(drop)) return <p className="text-sm">{describeRareDrop(drop)}.</p>;
  if (isCommonDrop(drop)) {
    const spots = farmSpots(drop, faction, zoneId);
    const hidden = allSpots ? 0 : Math.max(0, spots.length - SHOWN_FARM_SPOTS);
    return (
      <div className="space-y-2">
        <p className="text-sm">{describeCommonDrop(drop)}</p>
        <ul className="space-y-2" aria-label="Where to farm it">
          {spots.slice(0, spots.length - hidden).map((m) => (
            <FoodMobRow key={m.name} mob={m} warning={m.spot ? hostileGroundLabel(m.spot, faction) : ""} />
          ))}
        </ul>
        {hidden > 0 ? (
          <button type="button" className={DETAIL_LINK} onClick={() => setAllSpots(true)}>
            Show {hidden} more farm spots
          </button>
        ) : null}
      </div>
    );
  }
  // Lowest level first, so the list reads as a path you level along.
  const mobs = [...drop.mobs].sort((a, b) => a.minLevel - b.minLevel);
  const where = drop.zones.length ? `Mostly in ${drop.zones.join(", ")}.` : "";
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Drops from</p>
      <ul className="space-y-2" aria-label="Mobs that drop it">
        {mobs.map((m) => (
          <FoodMobRow key={m.name} mob={m} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {where}
        {otherMobs(drop.more)}
      </p>
    </div>
  );
}
