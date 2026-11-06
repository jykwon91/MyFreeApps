import CraftColorsLine from "@/games/wow-forever/components/crafting/CraftColorsLine";
import type { SmeltRecipe } from "@/games/wow-forever/types/crafting";

interface MiningSmeltRowProps {
  recipe: SmeltRecipe;
  /** "at a Forge" — where it's cast; "" for a camp item. */
  where: string;
}

/** One smelt (or camp item): what it takes, the skill to learn it, where it's cast, and its colours. */
export default function MiningSmeltRow({ recipe, where }: MiningSmeltRowProps) {
  return (
    <li className="p-3 space-y-0.5">
      <p className="font-medium">
        {recipe.name}
        {recipe.newInForever ? <span className="ml-2 text-xs font-normal text-muted-foreground">New in Forever</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">
        {recipe.reagents.map((r) => `${r.count} ${r.name}`).join(" + ")} · learn at {recipe.skill} {where}
      </p>
      <CraftColorsLine recipe={recipe} />
    </li>
  );
}
