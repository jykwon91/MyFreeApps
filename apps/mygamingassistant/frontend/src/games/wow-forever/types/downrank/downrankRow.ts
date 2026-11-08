import type { DownrankRank } from "@/games/wow-forever/types/downrank/downrankRank";

/** One rank worked out for the character: base roll, bonus share and the efficiency numbers. */
export interface DownrankRow {
  rank: DownrankRank;
  /** False when the character is below the rank's learn level — shown greyed and never "best". */
  learnable: boolean;
  /** The roll at this level, before bonus and talents (direct + every tick). */
  baseMin: number;
  baseMax: number;
  baseAvg: number;
  /** The penalties alone: below level 20 × downranking (1 = none). */
  penaltyFactor: number;
  /** Your bonus's share after both penalties: the direct coefficient + every tick's. */
  effectiveCoefficient: number;
  /** What the bonus adds, before talents. */
  bonusAdded: number;
  /** Average amount with bonus and talents. */
  amount: number;
  mana: number;
  perMana: number;
  /** The seconds `perSecond` divides by: the cast (at least the 1.5 sec global cooldown), or a tick-only spell's duration. */
  seconds: number;
  perSecond: number;
}
