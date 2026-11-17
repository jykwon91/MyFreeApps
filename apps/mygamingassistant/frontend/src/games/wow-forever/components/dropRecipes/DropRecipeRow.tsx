import { ChevronDown } from "lucide-react";
import DropRecipeSourceChip from "@/games/wow-forever/components/dropRecipes/DropRecipeSourceChip";
import DropRecipeTradeLine from "@/games/wow-forever/components/dropRecipes/DropRecipeTradeLine";
import DropRecipeWhere from "@/games/wow-forever/components/dropRecipes/DropRecipeWhere";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { RECIPE_PROFESSION_LABELS } from "@/games/wow-forever/data/recipes/recipesConfig";
import { dropRecipeSummary } from "@/games/wow-forever/lib/dropRecipes/dropRecipeSummary";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface DropRecipeRowProps {
  recipe: DropRecipe;
  faction: PlayerFaction;
  /** The picked character already knows it: crossed out, still listed. */
  known: boolean;
}

/** Closed: the recipe, its skill, where it drops and the best spot's odds. Open: every spot, the recipe item and whether it trades. */
export default function DropRecipeRow({ recipe, faction, known }: DropRecipeRowProps) {
  return (
    <li className="rounded-lg border bg-card" data-testid="drop-recipe-row" data-known={known || undefined}>
      <details className="group">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-start gap-2 rounded-lg p-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <GameIcon icon={recipe.icon} size={32} smSize={40} alt="" className="shrink-0" />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className={known ? "font-medium text-muted-foreground line-through" : "font-medium"}>{recipe.name}</span>
              {known ? (
                <span className="rounded-full border px-2 text-xs text-muted-foreground" data-testid="drop-recipe-known-badge">
                  {DROP_RECIPES_TEXT.knownBadge}
                </span>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                {RECIPE_PROFESSION_LABELS[recipe.profession]} {recipe.skill}
              </span>
              {recipe.sources.map((s) => (
                <DropRecipeSourceChip key={s} source={s} />
              ))}
            </span>
            <span className="block text-sm" data-testid="drop-recipe-summary">
              {dropRecipeSummary(recipe)}
            </span>
          </span>
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t p-3">
          <DropRecipeWhere recipe={recipe} faction={faction} />
          <div className="space-y-1 border-t pt-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">{DROP_RECIPES_TEXT.formula}:</span>
              <ItemNameLink itemId={recipe.item.id} name={recipe.item.name} withIcon />
              <ProvenanceBadge provenance={PROVENANCE.classic} />
            </p>
            <DropRecipeTradeLine recipe={recipe} faction={faction} />
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">{DROP_RECIPES_TEXT.recipeLink}:</span>
              <RecipeRef profession={recipe.profession} spell={recipe.spell} name={recipe.name} iconSize={16} />
            </p>
          </div>
        </div>
      </details>
    </li>
  );
}
