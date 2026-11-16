import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import {
  DROP_RECIPE_SORT_LABELS,
  DROP_RECIPE_SOURCE_LABELS,
  DROP_RECIPE_SOURCES,
  DROP_RECIPES_TEXT,
} from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { RECIPE_PROFESSION_LABELS } from "@/games/wow-forever/data/recipes/recipesConfig";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";
import { DROP_RECIPE_SORT, type DropRecipeSort } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";
import type { DropRecipeSource } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";
import type { SegmentedOption } from "@/games/wow-forever/types/segmentedOption";

const ALL_SOURCES = "all";
type SourceChoice = DropRecipeSource | typeof ALL_SOURCES;

const SOURCE_OPTIONS: readonly SegmentedOption<SourceChoice>[] = [
  { id: ALL_SOURCES, label: DROP_RECIPES_TEXT.allSources },
  ...DROP_RECIPE_SOURCES.map((s) => ({ id: s, label: DROP_RECIPE_SOURCE_LABELS[s] })),
];

const SORT_OPTIONS: readonly SegmentedOption<DropRecipeSort>[] = Object.values(DROP_RECIPE_SORT).map((s) => ({ id: s, label: DROP_RECIPE_SORT_LABELS[s] }));

interface DropRecipeFilterBarProps {
  /** The professions that have any drop-only recipe. */
  professions: readonly CraftingProfession[];
  filters: DropRecipeFilters;
  onChange: (next: DropRecipeFilters) => void;
}

/** Profession (with in-game icons), where it drops, and the order. */
export default function DropRecipeFilterBar({ professions, filters, onChange }: DropRecipeFilterBarProps) {
  const professionOptions = professions.map((p) => ({ id: p, label: RECIPE_PROFESSION_LABELS[p], icon: professionIcon(p) }));
  return (
    <div className="space-y-3" data-testid="drop-recipe-filters">
      <div className="space-y-1">
        <p className="text-sm font-medium" aria-hidden="true">
          {DROP_RECIPES_TEXT.professionLabel}
        </p>
        <SegmentedToggle<CraftingProfession>
          label={DROP_RECIPES_TEXT.professionLabel}
          options={professionOptions}
          value={filters.profession}
          onChange={(profession) => onChange({ ...filters, profession })}
          className="grid w-full grid-cols-3 sm:grid-cols-4"
          compact
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium" aria-hidden="true">
            {DROP_RECIPES_TEXT.sourceLabel}
          </p>
          <SegmentedToggle<SourceChoice>
            label={DROP_RECIPES_TEXT.sourceLabel}
            options={SOURCE_OPTIONS}
            value={filters.source ?? ALL_SOURCES}
            onChange={(next) => onChange({ ...filters, source: next === ALL_SOURCES ? null : next })}
            className="flex-wrap"
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium" aria-hidden="true">
            {DROP_RECIPES_TEXT.sortLabel}
          </p>
          <SegmentedToggle<DropRecipeSort>
            label={DROP_RECIPES_TEXT.sortLabel}
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(sort) => onChange({ ...filters, sort })}
          />
        </div>
      </div>
    </div>
  );
}
