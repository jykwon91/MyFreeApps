import GearItemRow from "@/games/wow-forever/components/gear/GearItemRow";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

/** Level 60 epics nothing says where to get — they may be raid loot, so they're kept out of the list. */
export default function GearUnknownEpics({ items }: { items: readonly RankedGearItem[] }) {
  return (
    <details className="border-t pt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground min-h-[44px] sm:min-h-0 flex items-center">
        {items.length} level 60 {items.length === 1 ? "epic" : "epics"} with no known source
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        These may drop in a raid, which isn&apos;t open yet. Percentages are against the top pick above.
      </p>
      <ul className="mt-2 divide-y">
        {items.map((r) => (
          <GearItemRow key={r.item.id} ranked={r} isTop={false} />
        ))}
      </ul>
    </details>
  );
}
