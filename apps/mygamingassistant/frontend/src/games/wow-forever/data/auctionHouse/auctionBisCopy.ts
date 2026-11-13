import { BIS_LEVEL } from "@/games/wow-forever/data/auctionHouse/auctionBisOptions";
import type { BisChoice } from "@/games/wow-forever/types/auctionHouse/bisChoice";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";

/** "BiS" only means something at the top: below it the picks are just the best for that level. */
function isTopLevel(level: number): boolean {
  return level >= BIS_LEVEL;
}

/** The legend over the picks' chips. */
export function bisLegend(level: number): string {
  return isTopLevel(level) ? "Best in slot (BiS) for my class" : "Top picks for my level";
}

/** The active-filter chip, naming the level and class the picks were worked out for. */
export function bisActiveLabel(choice: BisChoice, level: number, classLabel: string): string {
  const who = `level ${level} ${classLabel}`;
  if (isTopLevel(level)) return choice === "any" ? `Top 3 BiS for ${who}` : `#${choice} BiS for ${who}`;
  return choice === "any" ? `Top 3 for ${who}` : `#${choice} pick for ${who}`;
}

/** The badge on a row that is one of the picks, e.g. "#1 Head". */
export function bisBadgeText(pick: BisPick): string {
  return `#${pick.rank} ${pick.slot}`;
}
