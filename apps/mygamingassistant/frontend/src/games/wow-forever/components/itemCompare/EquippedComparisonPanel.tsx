import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import EquippedItemBlock from "@/games/wow-forever/components/itemCompare/EquippedItemBlock";
import ItemCompareSkeleton from "@/games/wow-forever/components/itemCompare/ItemCompareSkeleton";
import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { ITEM_COMPARE_COLUMN, ITEM_COMPARE_WARNING } from "@/games/wow-forever/data/itemCompare/itemCompareStyles";
import { ITEM_TOOLTIP_NOTE } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { canWear } from "@/games/wow-forever/gear/gearFilters";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { useVerdictScoring } from "@/games/wow-forever/hooks/useVerdictScoring";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { comparedWithText } from "@/games/wow-forever/lib/itemCompare/comparedWithText";
import { equippedComparisons } from "@/games/wow-forever/lib/itemCompare/equippedComparisons";
import { cantUseText, scoredForText } from "@/games/wow-forever/lib/itemCompare/verdictText";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface EquippedComparisonPanelProps {
  candidate: ClientItem;
  slug: string;
}

/**
 * The saved character's gear in the candidate's slot(s), each with whether the candidate is an
 * upgrade (scored like the Best gear page, for the spec saved there) and what changes. An item the
 * character can't use says so instead, without the gains that would read as a reason to buy it.
 */
export default function EquippedComparisonPanel({ candidate, slug }: EquippedComparisonPanelProps) {
  const { data, isError } = useGetCharacterQuery(slug);
  const items = useClientItems();
  const character = data && data.slug === slug ? data : undefined;
  const classId = character ? characterClassId(character.class_name) : undefined;
  const scoring = useVerdictScoring(character, items);

  if (isError && !character) return <p className={`${ITEM_TOOLTIP_NOTE} ${ITEM_COMPARE_COLUMN}`}>{COPY.characterError}</p>;
  if (items.status === LOAD_STATUS.error) return <p className={`${ITEM_TOOLTIP_NOTE} ${ITEM_COMPARE_COLUMN}`}>{COPY.itemsError}</p>;
  if (!character || items.status !== LOAD_STATUS.ready) return <ItemCompareSkeleton />;

  const caption = <p className="px-1 text-xs text-muted-foreground">{comparedWithText(character.name, character.surname)}</p>;
  if (classId && !canWear(candidate, classId, character.level)) {
    return (
      <div className={ITEM_COMPARE_COLUMN} data-testid="item-compare-equipped">
        {caption}
        <p className={ITEM_COMPARE_WARNING} data-testid="item-compare-cant-use">
          {cantUseText(character.level, character.class_name, candidate.itemType)}
        </p>
      </div>
    );
  }

  const comparisons = equippedComparisons(candidate, character.items, items.list.byId, scoring?.score ?? null);
  const enchanted = comparisons.some((c) => c.equipped.enchantments.length > 0);
  const scored = scoring !== null && comparisons.some((c) => c.kind === "known");
  return (
    <div className={ITEM_COMPARE_COLUMN} data-testid="item-compare-equipped">
      {caption}
      {scored ? (
        <p className="px-1 text-xs text-muted-foreground" data-testid="item-compare-scored-for">
          {scoredForText(scoring.label, scoring.leveling)}
        </p>
      ) : null}
      {comparisons.length === 0 ? (
        <p className={ITEM_TOOLTIP_NOTE}>{COPY.nothingEquipped}</p>
      ) : (
        comparisons.map((comparison) => <EquippedItemBlock key={comparison.equipped.slot} comparison={comparison} />)
      )}
      {enchanted ? <p className="px-1 text-xs text-muted-foreground">{COPY.enchantsNotCounted}</p> : null}
    </div>
  );
}
