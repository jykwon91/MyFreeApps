import CharacterRecipeGroupList from "@/games/wow-forever/components/character/CharacterRecipeGroupList";
import { RECIPE_COLOR_CAPTION } from "@/games/wow-forever/data/character/characterProfessionsConfig";
import { otherRecipesLabel } from "@/games/wow-forever/lib/character/characterProfessions";
import type { KnownRecipeGroup } from "@/games/wow-forever/types/character/knownRecipeGroup";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

interface CharacterRecipeGroupsProps {
  groups: readonly KnownRecipeGroup[];
  /** Links each name to its full recipe; null for a profession the Recipes page doesn't list. */
  profession: RecipeProfession | null;
}

/** The known recipes, by colour when we can colour them. */
export default function CharacterRecipeGroups({ groups, profession }: CharacterRecipeGroupsProps) {
  const coloured = groups.some((group) => group.color !== null);
  return (
    <div className="space-y-3">
      {coloured && <p className="text-xs text-muted-foreground">{RECIPE_COLOR_CAPTION}</p>}
      {groups.map((group) => (
        <CharacterRecipeGroupList key={group.color ?? "other"} group={group} profession={profession} otherLabel={otherRecipesLabel(coloured)} />
      ))}
    </div>
  );
}
