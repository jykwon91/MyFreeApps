import { Link } from "react-router-dom";
import EquippedComparisonPanel from "@/games/wow-forever/components/itemCompare/EquippedComparisonPanel";
import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { ITEM_TOOLTIP_NOTE } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { isEquippableSlot } from "@/games/wow-forever/lib/itemCompare/comparisonSlots";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/**
 * Beside a gear item's stats: what you wear in its slot, or how to say who you are.
 * Nothing for items that aren't worn. Mounted only while the tooltip is open, so the
 * character is fetched (and cached) the first time one opens, never otherwise.
 */
export default function ItemCompareSection({ candidate }: { candidate: ClientItem }) {
  const [{ characterSlug }] = usePlayerSettings();
  if (!isEquippableSlot(candidate.slot)) return null;
  if (characterSlug === null) {
    return (
      <p className={`${ITEM_TOOLTIP_NOTE} w-72 max-w-full sm:w-80`} data-testid="item-compare-no-character">
        {COPY.noCharacter}{" "}
        <Link to={COPY.characterLookupPath} className="underline underline-offset-2">
          {COPY.noCharacterLink}
        </Link>
      </p>
    );
  }
  return <EquippedComparisonPanel candidate={candidate} slug={characterSlug} />;
}
