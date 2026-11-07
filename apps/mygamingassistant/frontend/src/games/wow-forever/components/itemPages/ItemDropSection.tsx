import FoodMobRow from "@/games/wow-forever/components/food/detail/FoodMobRow";
import { hostileGroundLabel, levelRange, mobsForLevel, notAFarmLabel } from "@/games/wow-forever/food/recipeSources";
import type { DropSource } from "@/games/wow-forever/types/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ItemDropSectionProps {
  drop: DropSource;
  faction: PlayerFaction;
  level: number | null;
}

/**
 * Open-world drops: every named mob that drops it (best to farm at your level
 * first, each with its chance and Directions), then a random world drop's level
 * range. Gear drops are rare, so unlike the food pages a low chance still lists the mobs.
 */
export default function ItemDropSection({ drop, faction, level }: ItemDropSectionProps) {
  const ranked = mobsForLevel(drop.mobs, level);
  return (
    <div className="space-y-2">
      {ranked.length ? (
        <ul className="space-y-2" aria-label="Mobs that drop it">
          {ranked.map(({ mob, tooHigh }) => (
            <FoodMobRow
              key={mob.name}
              mob={mob}
              warning={mob.spot ? hostileGroundLabel(mob.spot, faction) : ""}
              note={notAFarmLabel(mob) || (tooHigh ? `Too high for level ${level}` : "")}
            />
          ))}
        </ul>
      ) : null}
      {drop.more > 0 ? <p className="text-xs text-muted-foreground">And {drop.more} more mobs.</p> : null}
      {drop.world ? (
        <p className="text-sm">
          Random world drop from mobs {levelRange(drop.levels)}
          {drop.zones.length ? `, mostly in ${drop.zones.join(", ")}` : ""} — any of them can drop it, rarely.
        </p>
      ) : null}
    </div>
  );
}
