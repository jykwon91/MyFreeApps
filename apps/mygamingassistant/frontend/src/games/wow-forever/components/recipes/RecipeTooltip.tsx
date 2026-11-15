import type { Placement } from "@floating-ui/react-dom";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import RecipeTooltipCard from "@/games/wow-forever/components/recipes/RecipeTooltipCard";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface RecipeTooltipProps {
  id: string;
  entry: RecipeEntry;
  setFloating: (node: HTMLElement | null) => void;
  floatingStyles: CSSProperties;
  /** Hidden until Floating UI has placed it, so it never flashes at the corner of the page. */
  isPositioned: boolean;
  placement: Placement;
}

/** A recipe-name tooltip, portalled to `<body>` like the item tooltip, and ignoring the pointer. */
export default function RecipeTooltip({ id, entry, setFloating, floatingStyles, isPositioned, placement }: RecipeTooltipProps) {
  return createPortal(
    <div
      ref={setFloating}
      id={id}
      role="tooltip"
      data-testid="recipe-tooltip"
      data-placement={placement}
      style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
      className="pointer-events-none z-50 w-72 max-w-[calc(100vw-16px)] sm:w-80"
    >
      <RecipeTooltipCard entry={entry} />
    </div>,
    document.body,
  );
}
