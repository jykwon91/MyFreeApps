import ItemNameList from "@/games/wow-forever/components/shared/ItemNameList";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { CLASSIC_RULE_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import { skinBandLine, skinBandNote } from "@/games/wow-forever/gathering/skinBandText";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";
import type { ItemRef } from "@/games/wow-forever/types/itemRef";

interface SkinBandCardProps {
  band: SkinBand;
  /** What beasts in the band skin into, main leather first. */
  leathers: readonly ItemRef[];
}

/** "Skill 115, level 18 → skin beasts level 15–20", what they skin into, and why the band stops there. */
export default function SkinBandCard({ band, leathers }: SkinBandCardProps) {
  const note = skinBandNote(band);
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2" data-testid="skin-now">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{skinBandLine(band)}</p>
        <ProvenanceBadge {...CLASSIC_RULE_TAG} />
      </div>
      {leathers.length > 0 && (
        <p className="text-sm">
          They skin into <span className="font-medium"><ItemNameList items={leathers} /></span>.
        </p>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
