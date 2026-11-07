import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";
import ItemTooltip from "@/games/wow-forever/components/itemPages/ItemTooltip";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";
import { itemPageHref } from "@/games/wow-forever/lib/itemPages/itemPageHref";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface ItemNameLinkProps {
  itemId: number;
  name: string;
  /** The item when the page already holds it, so its tooltip shows the stats at once. */
  item?: ClientItem;
  className?: string;
}

/**
 * An item's name as a link to its page (Back on that page returns here). Hover
 * or keyboard focus shows the item's in-game tooltip; a tap still just opens the page.
 */
export default function ItemNameLink({ itemId, name, item, className }: ItemNameLinkProps) {
  const location = useLocation();
  const { open, tooltipId, triggerProps, setReference, setFloating, floatingStyles, isPositioned, placement } = useHoverTooltip();
  return (
    <>
      <Link
        ref={setReference}
        to={itemPageHref(itemId)}
        state={{ from: `${location.pathname}${location.search}` }}
        className={clsx("underline-offset-2 hover:underline", className)}
        {...triggerProps}
      >
        {name}
      </Link>
      {open ? (
        <ItemTooltip
          id={tooltipId}
          itemId={itemId}
          item={item}
          setFloating={setFloating}
          floatingStyles={floatingStyles}
          isPositioned={isPositioned}
          placement={placement}
        />
      ) : null}
    </>
  );
}
