import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ItemCountList from "@/games/wow-forever/components/shared/ItemCountList";
import { makerOf } from "@/games/wow-forever/crafting/shoppingList";
import { recipeIcon } from "@/games/wow-forever/lib/icons/wowIcons";

interface CraftMakeItTextProps {
  itemId: number;
  place: CraftPlace;
  /** "You make this yourself" / "You can also make it yourself". */
  lead: string;
}

/** "You make this yourself with <icon> Bolt of Linen Cloth: 2 Linen Cloth each." */
export default function CraftMakeItText({ itemId, place, lead }: CraftMakeItTextProps) {
  const maker = makerOf(itemId, place.file.recipes);
  if (!maker) return <>{lead}.</>;
  return (
    <>
      {lead} with <GameIcon icon={recipeIcon(maker)} size={16} alt="" className="mr-1.5 -mt-0.5" />
      {maker.name}: <ItemCountList items={maker.reagents} separator=" + " /> each.
    </>
  );
}
