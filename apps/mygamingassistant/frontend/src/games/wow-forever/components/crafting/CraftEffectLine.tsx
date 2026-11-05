import { effectText } from "@/games/wow-forever/crafting/craftEffect";
import type { CraftingFile, CraftRecipe } from "@/games/wow-forever/types/crafting";

interface CraftEffectLineProps {
  recipe: CraftRecipe;
  file: Pick<CraftingFile, "recipes">;
  professionLabel: string;
}

/** One line under a recipe's name: what the item does, in the game's words. Nothing when the data doesn't say. */
export default function CraftEffectLine({ recipe, file, professionLabel }: CraftEffectLineProps) {
  const text = effectText(recipe, file, professionLabel);
  if (!text) return null;
  return (
    <p className="text-sm text-muted-foreground" data-testid="craft-effect">
      {text}
    </p>
  );
}
