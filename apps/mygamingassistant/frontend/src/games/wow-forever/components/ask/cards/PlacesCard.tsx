import { Link } from "react-router-dom";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { isRoutablePlace, routeToPlaceHref, zoneMapHref } from "@/games/wow-forever/lib/ask/askLinks";
import type { AskPlacesCard } from "@/games/wow-forever/types/ask/askPlacesCard";
import type { AskPlaceRow } from "@/games/wow-forever/types/ask/askPlaceRow";

interface PlacesCardProps {
  card: AskPlacesCard;
}

const LINK_CLASS =
  "inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded";

function placeLink(row: AskPlaceRow): { to: string; label: string } {
  if (isRoutablePlace(row)) return { to: routeToPlaceHref(row), label: ASK_COPY.routeThere };
  return { to: zoneMapHref(row.zoneId), label: ASK_COPY.showOnMap };
}

/** Places by name: a town or building routes there; a zone or city opens its map. */
export default function PlacesCard({ card }: PlacesCardProps) {
  return (
    <section aria-label={card.query} className="rounded-xl border bg-card p-3">
      <ul className="divide-y">
        {card.rows.map((row) => {
          const link = placeLink(row);
          return (
            <li key={row.placeId} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
              <span className="min-w-0 text-sm">
                <span className="block font-medium">{row.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.label}
                  {row.levels ? ` · ${row.levels}` : null}
                </span>
              </span>
              <Link to={link.to} className={LINK_CLASS}>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
