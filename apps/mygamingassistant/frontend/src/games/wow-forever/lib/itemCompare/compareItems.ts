import { STAT_KEYS } from "@/games/wow-forever/data/statKeys";
import { weaponDps } from "@/games/wow-forever/scoring/weaponDps";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ItemDelta } from "@/games/wow-forever/types/itemCompare/itemDelta";
import type { StatDelta } from "@/games/wow-forever/types/itemCompare/statDelta";

const DPS_DECIMALS = 10;

function itemDps(item: ClientItem): number | null {
  return item.weapon && !item.damageUnknown ? weaponDps(item.weapon) : null;
}

/**
 * What you gain (positive) or lose (negative) by wearing `candidate` instead of `equipped`; equal values are left out.
 * Effects the game files only count (`otherEffects`) and unknown weapon damage are flagged, not compared.
 */
export function compareItems(candidate: ClientItem, equipped: ClientItem): ItemDelta {
  const stats: StatDelta[] = [];
  for (const key of STAT_KEYS) {
    const amount = Math.round(((candidate.stats[key] ?? 0) - (equipped.stats[key] ?? 0)) * 100) / 100;
    if (amount !== 0) stats.push({ key, amount });
  }
  const candidateDps = itemDps(candidate);
  const equippedDps = itemDps(equipped);
  const dps =
    candidateDps !== null && equippedDps !== null ? Math.round((candidateDps - equippedDps) * DPS_DECIMALS) / DPS_DECIMALS : null;
  return {
    stats,
    armor: (candidate.armor ?? 0) - (equipped.armor ?? 0),
    dps,
    otherEffects: candidate.otherEffects > 0 || equipped.otherEffects > 0,
    damageNotCompared: candidate.damageUnknown || equipped.damageUnknown,
  };
}
