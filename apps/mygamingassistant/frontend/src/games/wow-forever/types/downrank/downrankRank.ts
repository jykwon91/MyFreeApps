import type { DownrankDirect } from "@/games/wow-forever/types/downrank/downrankDirect";
import type { DownrankPeriodic } from "@/games/wow-forever/types/downrank/downrankPeriodic";

/** One rank of a spell family, as `data/downrank/*.json` writes it. */
export interface DownrankRank {
  spell: number;
  rank: number;
  /** The level the rank is learned at. */
  level: number;
  maxLevel: number | null;
  /** "client" = the game files' max level; "nextRank" = one below the next rank's learn level. */
  maxLevelFrom: "client" | "nextRank" | null;
  /** The last character level with the full bonus (max level + 5); null = never downranked. */
  fullBonusUntil: number | null;
  /** The below-level-20 penalty's factor (1 at 20 and above). */
  lowLevelFactor: number;
  mana: number;
  castMs: number;
  direct: DownrankDirect | null;
  periodic: DownrankPeriodic | null;
  /** Where the numbers come from: the Forever client, or Classic (a rank Forever's files lack). */
  from: "client" | "classic";
  /** "client" = the game files' coefficient; "formula" = Classic's cast-time formula filled it. */
  coefficientFrom: "client" | "formula";
}
