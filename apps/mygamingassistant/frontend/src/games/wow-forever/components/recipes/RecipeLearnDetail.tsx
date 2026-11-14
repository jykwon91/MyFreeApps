import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import RecipeBuyLines from "@/games/wow-forever/components/recipeVendors/RecipeBuyLines";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { learnText } from "@/games/wow-forever/crafting/learnText";
import { RECIPE_PROFESSION_LABELS, RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import { hasSources } from "@/games/wow-forever/food/recipeSources";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

interface RecipeLearnDetailProps {
  entry: RecipeEntry;
  place: VendorPlace;
  zoneId: number | null;
  level: number | null;
}

/** Where to learn it: the trainer, or the recipe item's nearest vendor and every other source. */
export default function RecipeLearnDetail({ entry, place, zoneId, level }: RecipeLearnDetailProps) {
  const { learn, recipeSources } = entry;
  if (learn.kind !== "item") return <p className="text-sm">{learnText(learn, RECIPE_PROFESSION_LABELS[entry.profession])}</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {RECIPES_TEXT.learnFrom} <ItemIcon itemId={learn.itemId} />
        <span className="font-medium">{learn.item}</span> <span className="text-muted-foreground">(skill {learn.skill})</span>
      </p>
      {recipeSources && hasSources(recipeSources) ? (
        <>
          <RecipeBuyLines buys={[{ itemId: learn.itemId, name: learn.item, sources: recipeSources }]} place={place} />
          <FoodSourceList sources={recipeSources} faction={place.faction} zoneId={zoneId} level={level} />
          <p className="text-xs text-muted-foreground">
            {RECIPES_TEXT.sourcesTag} <ProvenanceBadge provenance={PROVENANCE.classic} />
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{RECIPES_TEXT.noSource}</p>
      )}
    </div>
  );
}
