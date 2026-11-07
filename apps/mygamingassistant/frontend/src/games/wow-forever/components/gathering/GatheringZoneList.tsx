import GatheringZoneRow from "@/games/wow-forever/components/gathering/GatheringZoneRow";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { CLASSIC_ROUTE_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import type { GatheringZone } from "@/games/wow-forever/types/gathering/gatheringZone";

/** The two or three zones to go to now — spawns are Classic data, so the list says so. */
export default function GatheringZoneList({ zones }: { zones: readonly GatheringZone[] }) {
  if (!zones.length) return <p className="text-sm text-muted-foreground">No zone on your side has enough of these to be worth the trip.</p>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Where to go</h3>
        <ProvenanceBadge {...CLASSIC_ROUTE_TAG} />
      </div>
      <ol className="rounded-xl border bg-card divide-y" aria-label="Where to go">
        {zones.map((zone) => (
          <GatheringZoneRow key={zone.zoneId} zone={zone} />
        ))}
      </ol>
    </div>
  );
}
