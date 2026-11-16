import { DROP_RECIPE_SOURCE_LABELS } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { DROP_RECIPE_SOURCE, type DropRecipeSource } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";

const CHIP_CLASSES: Readonly<Record<DropRecipeSource, string>> = {
  [DROP_RECIPE_SOURCE.openWorld]: "border-emerald-600/40 text-emerald-700 dark:text-emerald-300",
  [DROP_RECIPE_SOURCE.dungeon]: "border-sky-600/40 text-sky-700 dark:text-sky-300",
  [DROP_RECIPE_SOURCE.raid]: "border-orange-600/50 text-orange-700 dark:text-orange-300",
  [DROP_RECIPE_SOURCE.random]: "border-border text-muted-foreground",
};

/** "Open world" / "Dungeon" / "Raid" / "Random drop". */
export default function DropRecipeSourceChip({ source }: { source: DropRecipeSource }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${CHIP_CLASSES[source]}`} data-testid="drop-recipe-source">
      {DROP_RECIPE_SOURCE_LABELS[source]}
    </span>
  );
}
