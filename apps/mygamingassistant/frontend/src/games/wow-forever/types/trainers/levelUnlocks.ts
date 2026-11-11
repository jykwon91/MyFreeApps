import type { LevelUnlock } from "@/games/wow-forever/types/trainers/levelUnlock";

/** Everything a class can learn at one level. */
export interface LevelUnlocks {
  level: number;
  unlocks: readonly LevelUnlock[];
}
