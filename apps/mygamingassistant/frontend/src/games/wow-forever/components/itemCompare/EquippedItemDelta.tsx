import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { EQUIP_TEXT } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import type { DeltaLine } from "@/games/wow-forever/types/itemCompare/deltaLine";
import type { EquippedComparison } from "@/games/wow-forever/types/itemCompare/equippedComparison";

const LOSS_TEXT = "text-red-700 dark:text-red-400";

interface EquippedItemDeltaProps {
  comparison: EquippedComparison;
  /** The delta's lines; empty when nothing changes. Unused for an unknown comparison. */
  lines: readonly DeltaLine[];
}

/** What changes against one worn item: green gains, red losses, or why it can't be said. */
export default function EquippedItemDelta({ comparison, lines }: EquippedItemDeltaProps) {
  if (comparison.kind === "unknown") {
    return <p className="text-muted-foreground">{comparison.reason === "candidate" ? COPY.candidateUnknown : COPY.equippedUnknown}</p>;
  }
  if (lines.length === 0) return <p className="text-muted-foreground">{COPY.noChanges}</p>;
  return (
    <ul className="pt-1">
      {lines.map((line) => (
        <li key={line.key} className={line.gain ? EQUIP_TEXT : LOSS_TEXT} data-gain={line.gain}>
          {line.text}
        </li>
      ))}
    </ul>
  );
}
