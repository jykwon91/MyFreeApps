import type { BeastTeaching } from "@/games/wow-forever/types/hunterPets/beastTeaching";

/** A creature a hunter can tame. Classic beasts carry level, zones and speed; ones only the Forever client has met don't. */
export interface TamableBeast {
  id: number;
  name: string;
  familyId: number;
  /** Null for a beast only the Forever client has met. */
  minLevel: number | null;
  maxLevel: number | null;
  /** Seconds between melee swings; null when unknown. */
  attackSeconds: number | null;
  /** Where it spawns most, most first; empty when unknown. */
  zones: readonly string[];
  teaches: readonly BeastTeaching[];
  /** In cmangos classic-db (Classic data). */
  inClassic: boolean;
  /** The Forever client's creature cache has met it. */
  seenInGame: boolean;
}
