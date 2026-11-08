import type { Talent } from "@/games/wow-forever/types/talents/talent";

/** One of a class's three trees; `talents` in tier then column order (the build code's order). */
export interface TalentTree {
  id: number;
  name: string;
  icon: number;
  talents: readonly Talent[];
}
