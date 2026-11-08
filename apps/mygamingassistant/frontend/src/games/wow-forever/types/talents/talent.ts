import type { TalentPrereq } from "@/games/wow-forever/types/talents/talentPrereq";

/** One talent, decoded for the calculator. */
export interface Talent {
  id: number;
  name: string;
  tier: number;
  column: number;
  /** Icon file data id; 0 = no icon. */
  icon: number;
  /** Each rank's Forever text; null = not in the game files yet. `ranks.length` is the talent's max rank. */
  ranks: readonly (string | null)[];
  prereqs: readonly TalentPrereq[];
  /** The name is the Classic Era client's (no rank is in the Forever client yet). */
  classicName: boolean;
  /** Classic's text per rank where it differs from Forever's; null when nothing changed. */
  classicRanks: readonly (string | null)[] | null;
  /** Classic's text for ranks not in the Forever client yet, shown badged as Classic data; null when none. */
  classicFallback: readonly (string | null)[] | null;
}
