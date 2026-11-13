import type { Placement } from "@floating-ui/react-dom";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import ItemCompareSection from "@/games/wow-forever/components/itemCompare/ItemCompareSection";
import ItemTooltipContent from "@/games/wow-forever/components/itemPages/ItemTooltipContent";
import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { ITEM_COMPARE_COLUMN_WIDTH } from "@/games/wow-forever/data/itemCompare/itemCompareStyles";
import { ITEM_TOOLTIP_STATUS } from "@/games/wow-forever/data/itemPages/itemTooltipStatus";
import { useItemTooltipData } from "@/games/wow-forever/hooks/useItemTooltipData";
import type { HoverTooltipFloatingProps } from "@/games/wow-forever/types/itemPages/hoverTooltipFloatingProps";

interface ItemCompareTooltipProps {
  id: string;
  itemId: number;
  setFloating: (node: HTMLElement | null) => void;
  floatingProps: HoverTooltipFloatingProps;
  floatingStyles: CSSProperties;
  /** Hidden until Floating UI has placed it, so it never flashes at the corner of the page. */
  isPositioned: boolean;
  placement: Placement;
}

/**
 * An item's in-game stats with the gear you wear in its slot beside it (stacked when the screen is
 * narrow), as a non-modal popover portalled to `<body>`: it holds a link, so it is a labelled dialog
 * the trigger controls (not a `tooltip`), and it takes touches so a phone can scroll it. The hook's
 * `fitToViewport` caps its height to the room on screen.
 */
export default function ItemCompareTooltip({ id, itemId, setFloating, floatingProps, floatingStyles, isPositioned, placement }: ItemCompareTooltipProps) {
  const state = useItemTooltipData(itemId);
  const item = state.status === ITEM_TOOLTIP_STATUS.READY ? state.data.item : undefined;
  return createPortal(
    <div
      ref={setFloating}
      {...floatingProps}
      id={id}
      role="dialog"
      aria-label={COPY.dialogLabel}
      data-testid="item-compare-tooltip"
      data-placement={placement}
      style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
      className="z-50 flex w-max max-w-[calc(100vw-16px)] flex-wrap items-start gap-2 overflow-y-auto overscroll-contain focus:outline-none"
    >
      <div className={ITEM_COMPARE_COLUMN_WIDTH}>
        <ItemTooltipContent itemId={itemId} item={item} />
      </div>
      {item ? <ItemCompareSection candidate={item} /> : null}
    </div>,
    document.body,
  );
}
