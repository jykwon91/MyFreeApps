import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";
import { itemPageHref } from "@/games/wow-forever/lib/itemPages/itemPageHref";

interface ItemNameLinkProps {
  itemId: number;
  name: string;
  className?: string;
}

/** An item's name as a link to its page; Back on that page returns here. */
export default function ItemNameLink({ itemId, name, className }: ItemNameLinkProps) {
  const location = useLocation();
  return (
    <Link
      to={itemPageHref(itemId)}
      state={{ from: `${location.pathname}${location.search}` }}
      className={clsx("underline-offset-2 hover:underline", className)}
    >
      {name}
    </Link>
  );
}
