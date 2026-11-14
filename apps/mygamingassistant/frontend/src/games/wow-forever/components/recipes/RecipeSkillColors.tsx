import { RECIPE_SKILL_COLORS, RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface RecipeSkillColorsProps {
  entry: Pick<RecipeEntry, "skill" | "yellow" | "green" | "grey">;
}

/** "Learn at 75 · Yellow 90 · Green 102 · Gray 115" — only the numbers the data has. The word carries it, not the swatch. */
export default function RecipeSkillColors({ entry }: RecipeSkillColorsProps) {
  return (
    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      <span>
        {RECIPES_TEXT.learnAt} {entry.skill}
      </span>
      {RECIPE_SKILL_COLORS.map(({ key, label, swatch }) => {
        const value = entry[key];
        if (value === null) return null;
        return (
          <span key={key} className="inline-flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
            {label} {value}
          </span>
        );
      })}
    </p>
  );
}
