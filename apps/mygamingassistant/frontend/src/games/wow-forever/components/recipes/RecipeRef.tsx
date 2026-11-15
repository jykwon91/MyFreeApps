import type { ReactNode } from "react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import RecipeNameLink from "@/games/wow-forever/components/recipes/RecipeNameLink";
import { useRecipeLookup } from "@/games/wow-forever/hooks/useRecipeLookup";
import { findRecipeEntry } from "@/games/wow-forever/lib/recipes/recipeEntryLookup";
import type { GameIconSize } from "@/games/wow-forever/types/icons/gameIconSize";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

interface RecipeRefProps {
  /** Null for a profession the Recipes page doesn't list: the name stays plain. */
  profession: RecipeProfession | null;
  /** The recipe's spell; null when only the name is known. */
  spell: number | null;
  name: string;
  className?: string;
  /** What shows (icon and name); defaults to the name. */
  children?: ReactNode;
  /** Shows the recipe's icon before the name once its data is found (for lists that have no icon of their own). */
  iconSize?: GameIconSize;
}

/** A recipe name anywhere in WoW Forever: once we have its data, a link to the full recipe with a hover tooltip; plain until then. */
export default function RecipeRef({ profession, spell, name, className, children, iconSize }: RecipeRefProps) {
  const lookup = useRecipeLookup();
  const entry = lookup && profession ? findRecipeEntry(lookup, profession, spell, name) : null;
  const content = children ?? name;
  if (!entry) return <span className={className}>{content}</span>;
  return (
    <RecipeNameLink entry={entry} className={className}>
      {iconSize !== undefined && <GameIcon icon={entry.icon} size={iconSize} alt="" />}
      {content}
    </RecipeNameLink>
  );
}
