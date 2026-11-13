import type { Placement } from "@floating-ui/react-dom";
import type { CSSProperties, PointerEvent } from "react";
import { createPortal } from "react-dom";
import ItemCompareSection from "@/games/wow-forever/components/itemCompare/ItemCompareSection";
import ItemTooltipContent from "@/games/wow-forever/components/itemPages/ItemTooltipContent";
import { ITEM_TOOLTIP_STATUS } from "@/games/wow-forever/data/itemPages/itemTooltipStatus";
import { useItemTooltipData } from "@/games/wow-forever/hooks/useItemTooltipData";

interface ItemCompareTooltipProps {
  id: string;
  itemId: number;
  setFloating: (node: HTMLElement | null) => void;
  /** Keeps the tooltip open while the pointer is on it. */
  floatingProps: { onPointerEnter?: (event: PointerEvent) => void; onPointerLeave?: (event: PointerEvent) => void };
  floatingStyles: CSSProperties;
  /** Hidden until Floating UI has placed it, so it never flashes at the corner of the page. */
  isPositioned: boolean;
  placement: Placement;
}

/**
 * An item's in-game tooltip with the gear you wear in its slot beside it (stacked when the screen
 * is narrow), portalled to `<body>`. Unlike the plain item tooltip it takes touches, so a phone can
 * scroll it; the hook's `fitToViewport` caps its height to the room on screen.
 */
export default function ItemCompareTooltip({ id, itemId, setFloating, floatingProps, floatingStyles, isPositioned, placement }: ItemCompareTooltipProps) {
  const state = useItemTooltipData(itemId);
  const item = state.status === ITEM_TOOLTIP_STATUS.READY ? state.data.item : undefined;
  return createPortal(
    <div
      ref={setFloating}
      {...floatingProps}
      id={id}
      role="tooltip"
      data-testid="item-compare-tooltip"
      data-placement={placement}
      style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
      className="z-50 flex w-max max-w-[calc(100vw-16px)] flex-wrap items-start gap-2 overflow-y-auto overscroll-contain"
    >
      <div className="w-72 max-w-full sm:w-80">
        <ItemTooltipContent itemId={itemId} item={item} />
      </div>
      {item ? <ItemCompareSection candidate={item} /> : null}
    </div>,
    document.body,
  );
}
