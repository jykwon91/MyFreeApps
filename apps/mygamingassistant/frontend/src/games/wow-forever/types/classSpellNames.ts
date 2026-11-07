import type { WowClassId } from "@/games/wow-forever/data/classes";

/** The generated per-class spell names from the Forever client (`data/guide/classSpellNames.json`). */
export interface ClassSpellNames {
  source: string;
  clientBuild: string;
  classes: Readonly<Record<WowClassId, readonly string[]>>;
}
