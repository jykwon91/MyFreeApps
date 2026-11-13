import { SAME_SCORE_PCT, SCORE_EPSILON } from "@/games/wow-forever/data/itemCompare/upgradeVerdictConfig";
import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";

const PERCENT = 100;

/**
 * Better, worse or about the same as what is worn, from the two weighted scores. Within
 * SAME_SCORE_PCT of the worn score is "same"; a worn score of 0 gives a verdict without a %. Pure.
 */
export function upgradeVerdict(candidateScore: number, wornScore: number, statsOnly: boolean, bothHands = false): UpgradeVerdict {
  const diff = candidateScore - wornScore;
  if (wornScore <= 0) {
    if (Math.abs(diff) < SCORE_EPSILON) return { kind: "same", pct: null, statsOnly, bothHands };
    return { kind: diff > 0 ? "upgrade" : "downgrade", pct: null, statsOnly, bothHands };
  }
  const pct = Math.round((diff / wornScore) * PERCENT);
  if (Math.abs(pct) < SAME_SCORE_PCT) return { kind: "same", pct: null, statsOnly, bothHands };
  return { kind: pct > 0 ? "upgrade" : "downgrade", pct, statsOnly, bothHands };
}
