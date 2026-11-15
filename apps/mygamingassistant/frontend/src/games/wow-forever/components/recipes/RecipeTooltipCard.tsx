import CraftSpecChip from "@/games/wow-forever/components/crafting/CraftSpecChip";
import RecipeReagentList from "@/games/wow-forever/components/recipes/RecipeReagentList";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { RECIPE_PROFESSION_LABELS, RECIPE_TOOLTIP_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { learnSummary } from "@/games/wow-forever/lib/recipes/learnSummary";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/** A recipe at a glance: what it makes, the skill to learn it and how, and what goes in. */
export default function RecipeTooltipCard({ entry }: { entry: RecipeEntry }) {
  const nameClass = entry.makes ? QUALITY_TEXT_CLASSES[entry.makes.quality] : "text-foreground";
  const count = entry.makes && entry.makes.count > 1 ? ` ×${entry.makes.count}` : "";
  const summary = learnSummary(entry);
  return (
    <div className="space-y-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg">
      <div className="flex items-center gap-3">
        <GameIcon icon={entry.icon} size={40} alt="" thickBorder />
        <div className="min-w-0 space-y-0.5">
          <p className={`font-semibold ${nameClass}`}>
            {entry.name}
            {count}
          </p>
          <p className="flex items-center text-xs text-muted-foreground">
            <GameIcon icon={professionIcon(entry.profession)} size={16} alt="" className="mr-1.5" />
            {RECIPE_PROFESSION_LABELS[entry.profession]} {entry.skill}
            {summary ? ` · ${summary}` : null}
          </p>
          {entry.spec ? <CraftSpecChip name={entry.spec} /> : null}
        </div>
      </div>
      {entry.effect ? <p className="text-emerald-700 dark:text-emerald-400">{entry.effect}</p> : null}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{RECIPE_TOOLTIP_TEXT.reagents}</p>
        {entry.reagents.length ? (
          <RecipeReagentList reagents={entry.reagents} />
        ) : (
          <p className="text-xs text-muted-foreground">{RECIPE_TOOLTIP_TEXT.noReagents}</p>
        )}
      </div>
      <p className="border-t pt-2 text-xs text-muted-foreground">
        {RECIPE_TOOLTIP_TEXT.open}
      </p>
    </div>
  );
}
