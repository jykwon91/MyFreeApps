import { STAT_LABELS } from "@/games/wow-forever/data/statKeys";
import type { UpgradeGain } from "@/games/wow-forever/types/guild/upgradeGain";

/** "Worth +4 Intellect": a gear upgrade's gain in the wearer's best main stat. */
export function upgradeGainLabel(gain: UpgradeGain): string {
  return `Worth +${gain.points} ${STAT_LABELS[gain.stat]}`;
}
