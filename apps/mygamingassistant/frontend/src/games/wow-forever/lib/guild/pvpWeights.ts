import { PVP_STAMINA_SHARE } from "@/games/wow-forever/data/guild/guildHelpPvp";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import { mainStatPoint } from "@/games/wow-forever/lib/guild/mainStatPoint";

/**
 * PvP weights built from PvE ones: Stamina is raised to PVP_STAMINA_SHARE of one point of the
 * wearer's best main stat (never lowered). Everything else is unchanged. An estimate — see guildHelpPvp.
 */
export function pvpWeights(weights: StatWeights): StatWeights {
  const stamina = Math.max(weights.stats.stamina ?? 0, mainStatPoint(weights) * PVP_STAMINA_SHARE);
  return { ...weights, stats: { ...weights.stats, stamina } };
}
