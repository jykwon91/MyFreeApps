import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { ITEM_COMPARE_LOSS_TEXT, ITEM_COMPARE_MUTED_LINE } from "@/games/wow-forever/data/itemCompare/itemCompareStyles";
import { EQUIP_TEXT } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import { deltaLines, deltaNotes } from "@/games/wow-forever/lib/itemCompare/deltaLines";
import type { EquippedComparison } from "@/games/wow-forever/types/itemCompare/equippedComparison";

/**
 * What changes against one worn item: green gains, red losses, then what couldn't be compared.
 * "No stat changes" only when nothing was left out, so it is never a confident claim.
 */
export default function EquippedItemDelta({ comparison }: { comparison: EquippedComparison }) {
  if (comparison.kind === "unknown") {
    return <p className={ITEM_COMPARE_MUTED_LINE}>{comparison.reason === "candidate" ? COPY.candidateUnknown : COPY.equippedUnknown}</p>;
  }
  const lines = deltaLines(comparison.delta);
  const notes = deltaNotes(comparison.delta);
  return (
    <>
      {lines.length > 0 ? (
        <ul className="pt-1">
          {lines.map((line) => (
            <li key={line.key} className={line.gain ? EQUIP_TEXT : ITEM_COMPARE_LOSS_TEXT} data-gain={line.gain}>
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
      {lines.length === 0 && notes.length === 0 ? <p className={ITEM_COMPARE_MUTED_LINE}>{COPY.noChanges}</p> : null}
      {notes.map((note) => (
        <p key={note} className={`${ITEM_COMPARE_MUTED_LINE} pt-1 text-xs`}>
          {note}
        </p>
      ))}
    </>
  );
}
