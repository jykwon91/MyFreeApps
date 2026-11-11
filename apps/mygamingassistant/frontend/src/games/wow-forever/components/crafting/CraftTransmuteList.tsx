import CraftColorsLine from "@/games/wow-forever/components/crafting/CraftColorsLine";
import CraftLearnLine, { type CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import CraftReagents from "@/games/wow-forever/components/crafting/CraftReagents";
import SourceUnknownChip from "@/games/wow-forever/components/crafting/SourceUnknownChip";
import { learnAt, sourceUnknown } from "@/games/wow-forever/crafting/craftRoute";
import { recipeIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { transmutes } from "@/games/wow-forever/crafting/transmutes";
import type { CraftRecipe, TrainerSkills } from "@/games/wow-forever/types/crafting";

interface CraftTransmuteListProps {
  recipes: readonly CraftRecipe[];
  trainerSkills: TrainerSkills;
  professionLabel: string;
  place: CraftPlace;
}

/** Alchemy's Transmute recipes: not on the route, listed so you know which exist and how to learn them. */
export default function CraftTransmuteList({ recipes, trainerSkills, professionLabel, place }: CraftTransmuteListProps) {
  const list = transmutes(recipes);
  if (!list.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="transmutes-heading" data-testid="transmutes">
      <h3 id="transmutes-heading" className="font-semibold">
        Transmutes
      </h3>
      <p className="text-sm text-muted-foreground">Transmutes turn one material into another. They aren't on the route.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((recipe) => (
          <li key={recipe.spell} className="rounded-lg border bg-card p-3 space-y-1.5">
            <p className="flex flex-wrap items-center gap-2">
              <GameIcon icon={recipeIcon(recipe)} size={24} alt="" />
              <span className="font-medium">{recipe.name}</span>
              {sourceUnknown(recipe) ? <SourceUnknownChip /> : null}
            </p>
            <CraftColorsLine recipe={recipe} />
            <CraftReagents reagents={recipe.reagents} place={place} professionLabel={professionLabel} />
            <CraftLearnLine learn={learnAt(recipe, trainerSkills)} professionLabel={professionLabel} place={place} />
          </li>
        ))}
      </ul>
    </section>
  );
}
