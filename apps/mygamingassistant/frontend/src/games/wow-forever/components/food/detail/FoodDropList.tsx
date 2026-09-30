import { describeMob, describeRareDrop, isRareDrop } from "@/games/wow-forever/food/recipeSources";
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
    <div className="space-y-1">
      <p className="text-sm font-medium">Drops from</p>
      <ul className="list-disc pl-5 text-sm space-y-0.5">
        {mobs.map((m) => (
          <li key={m.name}>{describeMob(m)}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {where}
        {otherMobs(drop.more)}
      </p>
    </div>
  );
}
