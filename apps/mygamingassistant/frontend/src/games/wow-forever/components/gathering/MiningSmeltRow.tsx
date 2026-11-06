import CraftColorsLine from "@/games/wow-forever/components/crafting/CraftColorsLine";
import SourceUnknownChip from "@/games/wow-forever/components/crafting/SourceUnknownChip";
import { sourceUnknown } from "@/games/wow-forever/crafting/craftRoute";
import type { SmeltRecipe } from "@/games/wow-forever/types/crafting";

interface MiningSmeltRowProps {
  recipe: SmeltRecipe;
  /** "at a Forge" — where it's cast; "" for a camp item. */
  where: string;
}

/**
 * One smelt (or camp item): what it takes, where it's cast, and its colours.
 * A recipe Forever added that no Classic trainer teaches gets "Source unknown",
 * never a learn skill — its colours (from the client) still show.
 */
export default function MiningSmeltRow({ recipe, where }: MiningSmeltRowProps) {
  const unknown = sourceUnknown(recipe);
  return (
    <li className="p-3 space-y-0.5">
      <p className="font-medium">
        {recipe.name}
        {unknown && (
          <span className="ml-2">
            <SourceUnknownChip spellId={recipe.spell} />
          </span>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {recipe.reagents.map((r) => `${r.count} ${r.name}`).join(" + ")}
        {!unknown && ` · learn at ${recipe.skill}`} {where}
      </p>
      <CraftColorsLine recipe={recipe} />
    </li>
  );
}
