import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { RECIPE_PROFESSION_LABELS } from "@/games/wow-forever/data/recipes/recipesConfig";
import { knownNoteMessage } from "@/games/wow-forever/lib/dropRecipes/knownNoteMessage";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { KnownRecipesState } from "@/games/wow-forever/types/dropRecipes/knownRecipesState";

interface DropRecipeKnownNoteProps {
  state: KnownRecipesState;
  profession: CraftingProfession;
  onShowAll: () => void;
}

/** What the picked character's recipes did to the list, and a way back to every recipe. */
export default function DropRecipeKnownNote({ state, profession, onShowAll }: DropRecipeKnownNoteProps) {
  if (state.kind === "none") return null;
  const message = knownNoteMessage(state, RECIPE_PROFESSION_LABELS[profession]);
  return (
    <div className="space-y-2" data-testid="drop-recipe-known">
      {state.kind === "error" ? <LoadErrorRetry message={DROP_RECIPES_TEXT.knownError} onRetry={state.retry} retrying={state.retrying} /> : null}
      <div className="flex flex-wrap items-center gap-x-3 text-sm">
        {message ? <span className={state.kind === "not-found" ? "text-destructive" : undefined}>{message}</span> : null}
        <button type="button" onClick={onShowAll} className="min-h-[44px] underline underline-offset-2 hover:text-foreground">
          {DROP_RECIPES_TEXT.showAll}
        </button>
      </div>
    </div>
  );
}
