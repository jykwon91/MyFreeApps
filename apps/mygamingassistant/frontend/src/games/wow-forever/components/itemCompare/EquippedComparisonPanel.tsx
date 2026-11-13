import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import EquippedItemBlock from "@/games/wow-forever/components/itemCompare/EquippedItemBlock";
import ItemCompareSkeleton from "@/games/wow-forever/components/itemCompare/ItemCompareSkeleton";
import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { ITEM_TOOLTIP_NOTE } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { comparedWithText } from "@/games/wow-forever/lib/itemCompare/comparedWithText";
import { equippedComparisons } from "@/games/wow-forever/lib/itemCompare/equippedComparisons";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface EquippedComparisonPanelProps {
  candidate: ClientItem;
  slug: string;
}

const COLUMN = "w-72 max-w-full space-y-2 sm:w-80";

/** The saved character's gear in the candidate's slot(s), each with what changes. */
export default function EquippedComparisonPanel({ candidate, slug }: EquippedComparisonPanelProps) {
  const { data, isError } = useGetCharacterQuery(slug);
  const items = useClientItems();
  const character = data && data.slug === slug ? data : undefined;

  if (isError && !character) return <p className={`${ITEM_TOOLTIP_NOTE} ${COLUMN}`}>{COPY.characterError}</p>;
  if (items.status === LOAD_STATUS.error) return <p className={`${ITEM_TOOLTIP_NOTE} ${COLUMN}`}>{COPY.itemsError}</p>;
  if (!character || items.status !== LOAD_STATUS.ready) return <ItemCompareSkeleton />;

  const comparisons = equippedComparisons(candidate, character.items, items.list.byId);
  return (
    <div className={COLUMN} data-testid="item-compare-equipped">
      <p className="px-1 text-xs text-muted-foreground">{comparedWithText(character.name, character.surname)}</p>
      {comparisons.length === 0 ? (
        <p className={ITEM_TOOLTIP_NOTE}>{COPY.nothingEquipped}</p>
      ) : (
        comparisons.map((comparison) => <EquippedItemBlock key={comparison.equipped.slot} comparison={comparison} />)
      )}
    </div>
  );
}
