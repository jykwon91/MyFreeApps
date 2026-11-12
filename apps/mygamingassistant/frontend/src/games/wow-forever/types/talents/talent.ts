import type { TalentPrereq } from "@/games/wow-forever/types/talents/talentPrereq";

/** One talent, decoded for the calculator. */
export interface Talent {
  id: number;
  name: string;
  tier: number;
  column: number;
  /** Icon file data id; 0 = no icon. */
  icon: number;
  /** Each rank's Forever text. `ranks.length` is the talent's max rank. */
  ranks: readonly string[];
  prereqs: readonly TalentPrereq[];
  /** Classic has no talent like it. */
  newInForever: boolean;
  /** Classic's text per rank where it differs from Forever's; null when nothing changed. */
  classicRanks: readonly (string | null)[] | null;
}
