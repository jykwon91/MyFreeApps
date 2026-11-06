import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import { zoneLevelNote } from "@/games/wow-forever/gathering/zoneLevelNote";
import type { GatheringZone } from "@/games/wow-forever/types/gathering/gatheringZone";

/** One zone to gather in: what's worth it there, its levels, and Directions to the busiest spot. */
export default function GatheringZoneRow({ zone }: { zone: GatheringZone }) {
  const note = zoneLevelNote(zone);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 p-3" data-zone={zone.zoneId}>
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold">{zone.zoneName}</p>
        <p className="text-sm text-muted-foreground">
          {zone.nodes.join(", ")} · {zone.count} spawn points, most near {placeLabel(zone.spot)}
        </p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <FoodDirectionsLink spot={zone.spot} name={zone.zoneName} />
    </li>
  );
}
