import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import RecipeTooltip from "@/games/wow-forever/components/recipes/RecipeTooltip";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";
import { OPEN_RECIPE_STATE } from "@/games/wow-forever/data/recipes/recipesConfig";
import { recipeHref } from "@/games/wow-forever/lib/recipes/recipeHref";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface RecipeNameLinkProps {
  entry: RecipeEntry;
  className?: string;
  /** What the link shows (icon and name). */
  children: ReactNode;
}

/**
 * A recipe's name as a link to the Recipes page, which opens it. Hover or keyboard focus
 * shows the recipe's tooltip; a tap just opens the page.
 */
export default function RecipeNameLink({ entry, className, children }: RecipeNameLinkProps) {
  const { open, tooltipId, triggerProps, setReference, setFloating, floatingStyles, isPositioned, placement } = useHoverTooltip();
  return (
    <>
      <Link
        ref={setReference}
        to={recipeHref(entry)}
        state={OPEN_RECIPE_STATE}
        className={clsx("underline-offset-2 hover:underline", className)}
        {...triggerProps}
      >
        {children}
      </Link>
      {open ? (
        <RecipeTooltip
          id={tooltipId}
          entry={entry}
          setFloating={setFloating}
          floatingStyles={floatingStyles}
          isPositioned={isPositioned}
          placement={placement}
        />
      ) : null}
    </>
  );
}
