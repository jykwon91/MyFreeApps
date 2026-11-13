import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { formatVerdictPct } from "@/games/wow-forever/lib/itemCompare/formatVerdictPct";
import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";

/** "Scored for Fire Mage"; below level 60 the spec doesn't change the weights, so it says so. */
export function scoredForText(label: string, leveling: boolean): string {
  return leveling ? COPY.scoredForLeveling(label) : COPY.scoredFor(label);
}

/** "Your level 30 Hunter can't use this (Mail)." — the type only when the game files give it. */
export function cantUseText(level: number, className: string, itemType: string | null): string {
  return itemType ? COPY.cantUseType(level, className, itemType) : COPY.cantUse(level, className);
}

/** "Upgrade +12%" / "Downgrade −8%" / "About the same": the verdict's words, without the arrow. */
export function verdictText(verdict: UpgradeVerdict): string {
  const pct = formatVerdictPct(verdict.pct);
  return pct ? `${COPY.verdictWords[verdict.kind]} ${pct}` : COPY.verdictWords[verdict.kind];
}
