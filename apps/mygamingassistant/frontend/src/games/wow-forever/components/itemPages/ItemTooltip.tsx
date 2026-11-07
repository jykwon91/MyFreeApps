import type { Placement } from "@floating-ui/react-dom";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import ItemTooltipContent from "@/games/wow-forever/components/itemPages/ItemTooltipContent";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface ItemTooltipProps {
  id: string;
  itemId: number;
  item?: ClientItem;
  setFloating: (node: HTMLElement | null) => void;
  floatingStyles: CSSProperties;
  /** Hidden until Floating UI has placed it, so it never flashes at the corner of the page. */
  isPositioned: boolean;
  placement: Placement;
}

/**
 * The item-name tooltip, portalled to `<body>` so no `overflow` container clips
 * it and it never moves the page. It ignores the pointer, so it can't steal the
 * hover from the name it belongs to.
 */
export default function ItemTooltip({ id, itemId, item, setFloating, floatingStyles, isPositioned, placement }: ItemTooltipProps) {
  return createPortal(
    <div
      ref={setFloating}
      id={id}
      role="tooltip"
      data-testid="item-tooltip"
      data-placement={placement}
      style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
      className="pointer-events-none z-50 w-72 max-w-[calc(100vw-16px)] sm:w-80"
    >
      <ItemTooltipContent itemId={itemId} item={item} />
    </div>,
    document.body,
  );
}
