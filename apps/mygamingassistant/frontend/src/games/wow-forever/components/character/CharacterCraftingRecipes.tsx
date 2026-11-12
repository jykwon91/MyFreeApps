import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CharacterRecipeGroups from "@/games/wow-forever/components/character/CharacterRecipeGroups";
import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import { useCraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { groupKnownRecipes } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterProfession } from "@/games/wow-forever/types/character/characterProfession";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

const LOADING_ROWS = 4;

interface CharacterCraftingRecipesProps {
  profession: CharacterProfession;
  crafting: CraftingProfession;
}

/** A crafting profession's known recipes, coloured from its recipe file (loaded when the card opens). */
export default function CharacterCraftingRecipes({ profession, crafting }: CharacterCraftingRecipesProps) {
  const state = useCraftingData(crafting);
  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-label={`Loading the ${profession.name} recipes`}>
        <CharacterRowSkeletons count={LOADING_ROWS} height="h-6" />
      </div>
    );
  }
  if (state.status === "error") {
    return <LoadErrorRetry message={`Couldn't load the ${profession.name} recipes.`} onRetry={state.retry} retrying={false} />;
  }
  return <CharacterRecipeGroups groups={groupKnownRecipes(profession.recipes, profession.skill, state.data.recipes)} />;
}
