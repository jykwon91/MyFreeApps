import clsx from "clsx";
import { SKILL_COLOR_STYLE } from "@/games/wow-forever/data/professions/gathering/skillColorStyle";
import type { KnownRecipeGroup } from "@/games/wow-forever/types/character/knownRecipeGroup";

interface CharacterRecipeGroupListProps {
  group: KnownRecipeGroup;
  /** The uncoloured group's heading: "Other" beside coloured groups, "Known recipes" when it's the only list. */
  otherLabel: string;
}

/** One colour's known recipes: the colour word and count, then the names. */
export default function CharacterRecipeGroupList({ group, otherLabel }: CharacterRecipeGroupListProps) {
  const style = group.color && SKILL_COLOR_STYLE[group.color];
  return (
    <div className="space-y-1" data-testid="character-recipe-group" data-color={group.color ?? "other"}>
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        {style && <span className={clsx("h-2.5 w-2.5 rounded-full", style.swatch)} aria-hidden />}
        {style?.label ?? otherLabel} · {group.recipes.length}
      </h4>
      <ul className="grid gap-x-6 text-sm md:grid-cols-2">
        {group.recipes.map((recipe) => (
          <li key={recipe.id} className="break-words py-1.5">
            {recipe.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
