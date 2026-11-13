import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { formatLevelRange } from "@/games/wow-forever/lib/hunterPets/formatHunterPets";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface BeastNameProps {
  beast: TamableBeast;
  /** Show the level and zone after the name (the ability teacher lists). */
  withPlace?: boolean;
}

/** A beast's name with its provenance: Classic data, and Seen in game when the client has met it. */
export default function BeastName({ beast, withPlace = false }: BeastNameProps) {
  const level = formatLevelRange(beast);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium">{beast.name}</span>
      {withPlace && level ? <span className="text-muted-foreground">level {level}</span> : null}
      {withPlace && beast.zones.length > 0 ? <span className="text-muted-foreground">{beast.zones[0]}</span> : null}
      {beast.inClassic ? <ProvenanceBadge provenance={PROVENANCE.classic} /> : null}
      {beast.seenOn !== null ? <ProvenanceBadge provenance={PROVENANCE.seen} date={beast.seenOn} /> : null}
    </span>
  );
}
