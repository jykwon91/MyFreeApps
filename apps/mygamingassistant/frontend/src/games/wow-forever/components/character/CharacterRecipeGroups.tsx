import CharacterRecipeGroupList from "@/games/wow-forever/components/character/CharacterRecipeGroupList";
import { RECIPE_COLOR_CAPTION } from "@/games/wow-forever/data/character/characterProfessionsConfig";
import { otherRecipesLabel } from "@/games/wow-forever/lib/character/characterProfessions";
import type { KnownRecipeGroup } from "@/games/wow-forever/types/character/knownRecipeGroup";

/** The known recipes, by colour when we can colour them. */
export default function CharacterRecipeGroups({ groups }: { groups: readonly KnownRecipeGroup[] }) {
  const coloured = groups.some((group) => group.color !== null);
  return (
    <div className="space-y-3">
      {coloured && <p className="text-xs text-muted-foreground">{RECIPE_COLOR_CAPTION}</p>}
      {groups.map((group) => (
        <CharacterRecipeGroupList key={group.color ?? "other"} group={group} otherLabel={otherRecipesLabel(coloured)} />
      ))}
    </div>
  );
}
