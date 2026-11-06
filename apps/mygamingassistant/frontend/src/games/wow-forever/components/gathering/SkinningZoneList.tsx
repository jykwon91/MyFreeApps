import SkinningZoneRow from "@/games/wow-forever/components/gathering/SkinningZoneRow";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import { CONFIDENCE_BASIS_LABEL } from "@/games/wow-forever/data/professions/confidenceBasisLabel";
import type { SkinningZone } from "@/games/wow-forever/types/gathering/skinningZone";

/** The two or three zones to skin in now — mob levels and spawns are Classic data, so the list says so. */
export default function SkinningZoneList({ zones }: { zones: readonly SkinningZone[] }) {
  if (!zones.length) {
    return <p className="text-sm text-muted-foreground">No zone on your side has enough beasts in this level range — try a level or two lower.</p>;
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Where to go</h3>
        <UnconfirmedChip label={CONFIDENCE_BASIS_LABEL.classic} />
      </div>
      <ol className="rounded-xl border bg-card divide-y" aria-label="Where to go">
        {zones.map((zone) => (
          <SkinningZoneRow key={zone.zoneId} zone={zone} />
        ))}
      </ol>
    </div>
  );
}
