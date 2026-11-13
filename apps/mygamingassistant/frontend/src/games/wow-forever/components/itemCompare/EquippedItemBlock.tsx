import EquippedItemDelta from "@/games/wow-forever/components/itemCompare/EquippedItemDelta";
import UpgradeVerdictLine from "@/games/wow-forever/components/itemCompare/UpgradeVerdictLine";
import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { isItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { EquippedComparison } from "@/games/wow-forever/types/itemCompare/equippedComparison";

/** One worn item: its name in quality colour, whether the hovered item is an upgrade, then what changes if it replaces it. */
export default function EquippedItemBlock({ comparison }: { comparison: EquippedComparison }) {
  const { equipped } = comparison;
  const nameClass = isItemQuality(equipped.quality) ? QUALITY_TEXT_CLASSES[equipped.quality] : "";
  return (
    <section aria-label={COPY.heading} className="rounded-xl border bg-card p-4 space-y-0.5 text-sm shadow-lg" data-testid="item-compare-block">
      <p className="text-xs text-muted-foreground">{COPY.heading}</p>
      <p className={`font-semibold ${nameClass}`}>{equipped.name}</p>
      {comparison.kind === "known" && comparison.verdict ? <UpgradeVerdictLine verdict={comparison.verdict} /> : null}
      {comparison.replacesTwoHander ? <p className="text-xs text-muted-foreground">{COPY.replacesTwoHander}</p> : null}
      <EquippedItemDelta comparison={comparison} />
    </section>
  );
}
