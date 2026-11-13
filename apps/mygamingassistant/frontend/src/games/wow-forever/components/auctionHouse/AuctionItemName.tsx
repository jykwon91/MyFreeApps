import ItemCompareTooltip from "@/games/wow-forever/components/itemCompare/ItemCompareTooltip";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";

interface AuctionItemNameProps {
  itemId: number;
  label: string;
}

/**
 * An auction row's item name (at least 44x44 to touch). Hover, or Enter / Space (which moves focus into it),
 * opens the item's in-game stats beside what you wear in its slot; a tap opens it too. Escape, a tap
 * elsewhere, or tabbing out closes it.
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
        aria-haspopup="dialog"
        className="group flex min-h-[44px] min-w-[44px] max-w-full items-center rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
