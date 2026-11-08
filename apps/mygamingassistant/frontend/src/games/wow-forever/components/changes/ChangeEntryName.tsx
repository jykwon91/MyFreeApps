import { Link, useLocation } from "react-router-dom";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

const LINK = "underline-offset-2 hover:underline";

/** A row's name: an item link (with its tooltip), a link to our own page, or plain text when there's none. */
export default function ChangeEntryName({ entry }: { entry: ChangeEntry }) {
  const location = useLocation();
  if (entry.itemId !== null) return <ItemNameLink itemId={entry.itemId} name={entry.name} />;
  if (entry.href === null) return <>{entry.name}</>;
  return (
    <Link to={entry.href} state={{ from: `${location.pathname}${location.search}` }} className={LINK}>
      {entry.name}
    </Link>
  );
}
