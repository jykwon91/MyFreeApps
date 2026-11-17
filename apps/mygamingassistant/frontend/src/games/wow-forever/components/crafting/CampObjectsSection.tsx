import { useMemo } from "react";
import CampObjectCard from "@/games/wow-forever/components/crafting/CampObjectCard";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import { CAMP_OBJECTS_TEXT } from "@/games/wow-forever/data/professions/crafting/campObjectsText";
import { campRecipes } from "@/games/wow-forever/lib/campObjects/campRecipes";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

interface CampObjectsSectionProps {
  recipes: readonly CraftRecipe[];
  place: CraftPlace;
  professionLabel: string;
}

/** "Camp objects": the campfire objects this profession builds (Spinning Wheel, Arcane Salvager…). */
export default function CampObjectsSection({ recipes, place, professionLabel }: CampObjectsSectionProps) {
  const camp = useMemo(() => campRecipes(recipes), [recipes]);
  if (camp.length === 0) return null;
  return (
    <GuideSection id={CAMP_OBJECTS_TEXT.id} title={CAMP_OBJECTS_TEXT.title} intro={CAMP_OBJECTS_TEXT.intro}>
      <p className="text-sm text-muted-foreground">{CAMP_OBJECTS_TEXT.levelNote}</p>
      <ul className="grid gap-3 lg:grid-cols-2" aria-label={`${professionLabel} camp objects`}>
        {camp.map((recipe) => (
          <CampObjectCard key={recipe.spell} recipe={recipe} place={place} professionLabel={professionLabel} />
        ))}
      </ul>
    </GuideSection>
  );
}
