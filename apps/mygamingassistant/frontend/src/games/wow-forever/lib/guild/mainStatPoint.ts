import { MAIN_STATS } from "@/games/wow-forever/data/guild/guildHelpConfig";
import type { StatKey } from "@/games/wow-forever/data/statKeys";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";

/** What one point of the wearer's best main stat is worth on their weights: the least an enchant must give. */
export function mainStatPoint(weights: StatWeights): number {
  return Math.max(0, ...MAIN_STATS.map((stat) => weights.stats[stat] ?? 0));
}

/** Stamina last, so it names the gain only when it alone leads (PvP weights tie it with the best main stat). */
const STAMINA_LAST: readonly StatKey[] = [...MAIN_STATS.filter((stat) => stat !== "stamina"), "stamina"];

/** The main stat the wearer's weights value most (Spell damage & healing for a Mage); null when none counts. */
export function bestMainStat(weights: StatWeights): StatKey | null {
  let best: StatKey | null = null;
  for (const stat of STAMINA_LAST) {
    if ((weights.stats[stat] ?? 0) > (best ? (weights.stats[best] ?? 0) : 0)) best = stat;
  }
  return best;
}
