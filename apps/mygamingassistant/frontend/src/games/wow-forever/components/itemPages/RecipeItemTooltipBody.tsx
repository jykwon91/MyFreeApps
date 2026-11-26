import ItemStatsBlock from "@/games/wow-forever/components/itemPages/ItemStatsBlock";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { EQUIP_TEXT } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import { bindText } from "@/games/wow-forever/lib/itemPages/describeItem";
import { reagentsText, recipeRequiresText, recipeUseText } from "@/games/wow-forever/lib/itemPages/recipeItemText";
import { ITEM_BIND } from "@/games/wow-forever/types/itemPages/itemBind";
import type { RecipeItemTooltipData } from "@/games/wow-forever/types/itemPages/recipeItemTooltipData";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface RecipeItemTooltipBodyProps {
  data: RecipeItemTooltipData;
}

/**
 * A Pattern / Plans / Formula the Forever item files haven't shown yet, as the game words it:
 * what it needs and teaches, then the item it makes, then the reagents. All of it comes from the
 * profession data; a skill that is only Classic's estimate carries the Classic badge.
 */
export default function RecipeItemTooltipBody({ data }: RecipeItemTooltipBodyProps) {
  const { recipe, product } = data;
  return (
    <section
      aria-label="Recipe item"
      className="space-y-0.5 rounded-xl border bg-card p-4 text-sm shadow-lg"
      data-testid="recipe-item-tooltip"
    >
      <p className="font-semibold">{recipe.name}</p>
      {recipe.bop ? <p>{bindText(ITEM_BIND.pickup)}</p> : null}
      <p>
        {recipeRequiresText(recipe)} {recipe.estimated ? <ProvenanceBadge provenance={PROVENANCE.classic} /> : null}
      </p>
      <p className={EQUIP_TEXT}>{recipeUseText(recipe)}</p>
      {product ? (
        <ItemStatsBlock item={product.item} facts={product.facts} showVendorPrice={false} bare className="mt-2 border-t pt-2" />
      ) : null}
      {recipe.reagents.length > 0 ? <p className="pt-1 text-muted-foreground">{reagentsText(recipe.reagents)}</p> : null}
    </section>
  );
}
