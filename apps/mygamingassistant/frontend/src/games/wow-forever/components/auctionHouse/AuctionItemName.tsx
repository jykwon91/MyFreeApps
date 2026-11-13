import ItemCompareTooltip from "@/games/wow-forever/components/itemCompare/ItemCompareTooltip";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";

interface AuctionItemNameProps {
  itemId: number;
  label: string;
}

/**
 * An auction row's item name. Hover or keyboard focus shows the item's in-game tooltip beside
 * what you wear in its slot; a tap opens it and a tap anywhere else closes it. The tap area
 * reaches past the text so it is a phone-sized target without moving the row.
 */
export default function AuctionItemName({ itemId, label }: AuctionItemNameProps) {
  const { open, tooltipId, triggerProps, floatingProps, setReference, setFloating, floatingStyles, isPositioned, placement } = useHoverTooltip({
    toggleOnTap: true,
    fitToViewport: true,
    interactive: true,
  });
  return (
    <>
      <button
        type="button"
        ref={setReference}
        aria-expanded={open}
        className="group relative block min-w-0 rounded text-left before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...triggerProps}
      >
        <span className="line-clamp-2 min-w-0 break-words font-medium underline-offset-2 group-hover:underline" data-testid="auction-item-name">
          {label}
        </span>
      </button>
      {open ? (
        <ItemCompareTooltip
          id={tooltipId}
          itemId={itemId}
          setFloating={setFloating}
          floatingProps={floatingProps}
          floatingStyles={floatingStyles}
          isPositioned={isPositioned}
          placement={placement}
        />
      ) : null}
    </>
  );
}
