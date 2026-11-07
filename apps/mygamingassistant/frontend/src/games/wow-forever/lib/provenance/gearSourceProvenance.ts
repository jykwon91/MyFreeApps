import type { SourceChipKind } from "@/games/wow-forever/gear/gearSourceText";
import { PROVENANCE, type Provenance } from "@/games/wow-forever/types/provenance/provenance";

const GEAR_SOURCE_PROVENANCE: Readonly<Record<SourceChipKind, Provenance | null>> = {
  crafted: PROVENANCE.client,
  quest: PROVENANCE.classic,
  drop: PROVENANCE.classic,
  unknown: null,
};

/** Where a Best gear source comes from: recipes are in the Forever game files, quests and boss drops are Classic data. Unknown has none. */
export function gearSourceProvenance(kind: SourceChipKind): Provenance | null {
  return GEAR_SOURCE_PROVENANCE[kind];
}
