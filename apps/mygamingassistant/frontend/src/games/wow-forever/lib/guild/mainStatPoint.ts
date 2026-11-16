import { MAIN_STATS } from "@/games/wow-forever/data/guild/guildHelpConfig";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";

/** What one point of the wearer's best main stat is worth on their weights: the least an enchant must give. */
export function mainStatPoint(weights: StatWeights): number {
  return Math.max(0, ...MAIN_STATS.map((stat) => weights.stats[stat] ?? 0));
}
