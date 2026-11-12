import { Link } from "react-router-dom";
import CharacterCraftingRecipes from "@/games/wow-forever/components/character/CharacterCraftingRecipes";
import CharacterRecipeGroups from "@/games/wow-forever/components/character/CharacterRecipeGroups";
import {
  craftingProfession,
  groupKnownRecipes,
  guideProfession,
  professionGuideHref,
} from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterProfession } from "@/games/wow-forever/types/character/characterProfession";

/** An open profession card: a link to our guide, then the recipes the character knows. */
export default function CharacterProfessionRecipes({ profession }: { profession: CharacterProfession }) {
  const guide = guideProfession(profession.id);
  const crafting = craftingProfession(guide);
  return (
    <div className="space-y-3">
      {guide && (
        <Link
          to={professionGuideHref(guide, profession.skill)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {profession.name} guide from {profession.skill}
        </Link>
      )}
      {crafting && <CharacterCraftingRecipes profession={profession} crafting={crafting} />}
      {!crafting && <CharacterRecipeGroups groups={groupKnownRecipes(profession.recipes, profession.skill, null)} />}
    </div>
  );
}
