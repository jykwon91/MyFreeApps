import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { RECIPE_ALL_PROFESSIONS, RECIPE_PROFESSION_LABELS, RECIPE_PROFESSIONS, RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";
import type { RecipeProfessionChoice } from "@/games/wow-forever/types/recipes/recipeProfessionChoice";
import type { SegmentedOption } from "@/games/wow-forever/types/segmentedOption";

/** "All", then every profession with its in-game icon. */
const OPTIONS: readonly SegmentedOption<RecipeProfessionChoice>[] = [
  { id: RECIPE_ALL_PROFESSIONS, label: RECIPES_TEXT.allProfessions },
  ...RECIPE_PROFESSIONS.map((p) => ({ id: p, label: RECIPE_PROFESSION_LABELS[p], icon: professionIcon(p) })),
];

interface RecipeProfessionToggleProps {
  value: RecipeProfession | undefined;
  onChange: (profession: RecipeProfession | undefined) => void;
}

/** The profession filter as icon buttons: three to a row on a phone, one wrapping row from sm up. */
export default function RecipeProfessionToggle({ value, onChange }: RecipeProfessionToggleProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium" aria-hidden="true">
        {RECIPES_TEXT.professionLabel}
      </p>
      <SegmentedToggle<RecipeProfessionChoice>
        label={RECIPES_TEXT.professionLabel}
        options={OPTIONS}
        value={value ?? RECIPE_ALL_PROFESSIONS}
        onChange={(next) => onChange(next === RECIPE_ALL_PROFESSIONS ? undefined : next)}
        className="grid w-full grid-cols-3 sm:flex sm:flex-wrap"
        compact
      />
    </div>
  );
}
