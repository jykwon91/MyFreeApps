import { useState } from "react";
import FoodMobRow from "@/games/wow-forever/components/food/detail/FoodMobRow";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { describeSkinning } from "@/games/wow-forever/crafting/matSources";
import { canFarm, farmSpots, hostileGroundLabel, notAFarmLabel } from "@/games/wow-forever/food/recipeSources";
import type { DropMob, SkinningSource } from "@/games/wow-forever/types/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Beasts shown before "Show more" — the closest few, so the panel stays short. */
const SHOWN_BEASTS = 4;

interface CraftSkinningListProps {
  skinning: SkinningSource;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

function beastNote(mob: DropMob, level: number | null): string {
  const notAFarm = notAFarmLabel(mob);
  if (notAFarm) return notAFarm;
  return level !== null && !canFarm(mob, level) ? `Too high for level ${level}` : "";
}

/** Leather and hides: the level band, then a beast to skin per zone (closest to home first) with directions. */
export default function CraftSkinningList({ skinning, faction, zoneId, level }: CraftSkinningListProps) {
  const [showAll, setShowAll] = useState(false);
  const beasts = farmSpots(skinning, faction, zoneId, level);
  const hidden = showAll ? 0 : Math.max(0, beasts.length - SHOWN_BEASTS);
  return (
    <div className="space-y-2">
      <p className="text-sm">{describeSkinning(skinning)}</p>
      {beasts.length ? (
        <>
          <p className="text-xs text-muted-foreground">Where to skin it — the % is the chance per skin.</p>
          <ul className="space-y-2" aria-label="Where to skin it">
            {beasts.slice(0, beasts.length - hidden).map((m) => (
              <FoodMobRow
                key={m.name}
                mob={m}
                warning={m.spot ? hostileGroundLabel(m.spot, faction) : ""}
                note={beastNote(m, level)}
              />
            ))}
          </ul>
        </>
      ) : null}
      {hidden > 0 ? (
        <button type="button" className={DETAIL_LINK} onClick={() => setShowAll(true)}>
          Show {hidden} more places to skin
        </button>
      ) : null}
    </div>
  );
}
