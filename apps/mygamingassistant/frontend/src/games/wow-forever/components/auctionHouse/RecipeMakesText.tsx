import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** "Makes 2 × <icon> Runed Copper Rod", or why an enchant makes none. */
export default function RecipeMakesText({ recipe }: { recipe: CraftRecipe }) {
  if (!recipe.creates) return <>An enchant: it makes no item.</>;
  return (
    <>
      Makes {recipe.creates.count} × <ItemIcon itemId={recipe.creates.id} />
      {recipe.creates.name}
    </>
  );
}
