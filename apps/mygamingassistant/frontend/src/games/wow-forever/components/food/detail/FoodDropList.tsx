import FoodMobRow from "@/games/wow-forever/components/food/detail/FoodMobRow";
import { describeRareDrop, isRareDrop } from "@/games/wow-forever/food/recipeSources";
import type { DropSource } from "@/games/wow-forever/types/recipeSources";

function otherMobs(more: number): string {
  if (more <= 0) return "";
  return more === 1 ? " 1 other mob drops it too." : ` ${more} other mobs drop it too.`;
}

/** The best mobs to farm — or, for a rare / world drop, just the levels and where. */
export default function FoodDropList({ drop }: { drop: DropSource }) {
  if (isRareDrop(drop)) return <p className="text-sm">{describeRareDrop(drop)}.</p>;
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
