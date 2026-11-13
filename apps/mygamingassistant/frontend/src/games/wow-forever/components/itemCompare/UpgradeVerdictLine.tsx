import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { VERDICT_STYLES } from "@/games/wow-forever/data/itemCompare/itemCompareStyles";
import { verdictText } from "@/games/wow-forever/lib/itemCompare/verdictText";
import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";

/** "▲ Upgrade +12%" in green, "▼ Downgrade −8%" in red, "About the same" muted; the arrow is hidden from screen readers. */
export default function UpgradeVerdictLine({ verdict }: { verdict: UpgradeVerdict }) {
  const style = VERDICT_STYLES[verdict.kind];
  return (
    <p className={`font-semibold ${style.text}`} data-testid="item-compare-verdict" data-verdict={verdict.kind}>
      {style.arrow ? <span aria-hidden="true">{style.arrow} </span> : null}
      {verdictText(verdict)}
      {verdict.bothHands ? <span className="block text-xs font-normal text-muted-foreground">{COPY.bothHands}</span> : null}
      {verdict.statsOnly ? <span className="block text-xs font-normal text-muted-foreground">{COPY.statsOnly}</span> : null}
    </p>
  );
}
