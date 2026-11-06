import type { GearSlotResult } from "@/games/wow-forever/types/gearSlotResult";

/** Every slot card for one class, spec and level. */
export interface GearRanking {
  slots: readonly GearSlotResult[];
  /** Leveling only: items left out because nothing says what level you get them at. */
  unknownLevelCount: number;
}
