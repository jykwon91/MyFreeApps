import RecipeNameLink from "@/games/wow-forever/components/recipes/RecipeNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface GuildRecipeNameProps {
  name: string;
  /** Our data for the recipe; null while it loads or when we don't have it. */
  entry: RecipeEntry | null;
}

/** A guild recipe's icon and name: a link with the recipe's tooltip once we have its data, plain text until then. */
export default function GuildRecipeName({ name, entry }: GuildRecipeNameProps) {
  const icon = <GameIcon icon={entry?.icon ?? null} size={32} alt="" thickBorder />;
  if (!entry) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="font-semibold">{name}</span>
      </span>
    );
  }
  const color = entry.makes ? QUALITY_TEXT_CLASSES[entry.makes.quality] : undefined;
  return (
    <RecipeNameLink entry={entry} className="flex min-w-0 items-center gap-2 font-semibold">
      {icon}
      <span className={color}>{name}</span>
    </RecipeNameLink>
  );
}
