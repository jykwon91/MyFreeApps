import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import RecipeTrainerWhere from "@/games/wow-forever/components/recipes/RecipeTrainerWhere";
import RecipeBuyLines from "@/games/wow-forever/components/recipeVendors/RecipeBuyLines";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { itemSkillText, learnText } from "@/games/wow-forever/crafting/learnText";
import { RECIPE_PROFESSION_LABELS, RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import { hasSources } from "@/games/wow-forever/food/recipeSources";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { recipeSpell } from "@/games/wow-forever/lib/recipes/recipeSpell";
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
  const { learn, recipeSources, profession } = entry;
  const label = RECIPE_PROFESSION_LABELS[profession];
  if (learn.kind === "trainer" && !learn.newInForever && profession !== "cooking") {
    return (
      <div className="space-y-1">
        <p className="text-sm">{learnText(learn, label)}:</p>
        <RecipeTrainerWhere
          profession={profession}
          professionLabel={label}
          spell={recipeSpell(entry)}
          skill={learn.skill}
          faction={place.faction}
          zoneId={zoneId}
        />
      </div>
    );
  }
  if (learn.kind !== "item") return <p className="text-sm">{learnText(learn, label)}</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {RECIPES_TEXT.learnFrom} <ItemNameLink itemId={learn.itemId} name={learn.item} withIcon className="font-medium" /> <span className="text-muted-foreground">({itemSkillText(learn)})</span>
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
