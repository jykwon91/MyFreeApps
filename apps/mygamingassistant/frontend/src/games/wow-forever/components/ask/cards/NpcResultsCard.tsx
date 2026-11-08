import { useState } from "react";
import { Link } from "react-router-dom";
import { Navigation } from "lucide-react";
import AskMiniMap from "@/games/wow-forever/components/ask/cards/AskMiniMap";
import NpcResultRow from "@/games/wow-forever/components/ask/cards/NpcResultRow";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { routeToNpcHref } from "@/games/wow-forever/lib/ask/askLinks";
import type { AskNpcCard } from "@/games/wow-forever/types/ask/askNpcCard";

interface NpcResultsCardProps {
  card: AskNpcCard;
}

/**
 * The nearest NPCs a search found: a small map of the picked one's zone (the
 * first one's until you pick) and the numbered list. Picking a row shows
 * "Route there", which opens the World Map with directions to it.
 */
export default function NpcResultsCard({ card }: NpcResultsCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = card.rows.find((row) => row.poiId === selectedId) ?? null;
  const shownZone = selected ?? card.rows[0];
  const onZone = card.rows.filter((row) => row.zoneId === shownZone.zoneId);
  const toggle = (poiId: string) => setSelectedId((current) => (current === poiId ? null : poiId));

  return (
    <section aria-label={card.query} className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        {card.origin ? (
          <span>
            {ASK_COPY.fromLabel} {card.origin.label}
          </span>
        ) : null}
        <span>{ASK_COPY.found(card.rows.length, card.total)}</span>
      </div>
      {card.otherFaction ? <p className="text-sm text-muted-foreground">{ASK_COPY.otherFaction}</p> : null}
      <AskMiniMap
        zoneId={shownZone.zoneId}
        zoneName={shownZone.zoneName}
        rows={onZone}
        selectedId={selectedId}
        origin={card.origin}
      />
      <ol className="space-y-1">
        {card.rows.map((row) => (
          <NpcResultRow key={row.poiId} row={row} selected={row.poiId === selectedId} onToggle={toggle} />
        ))}
      </ol>
      {selected ? (
        <Link
          to={routeToNpcHref(selected, card.origin, card.faction)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Navigation className="h-4 w-4" aria-hidden />
          {ASK_COPY.routeThere}
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">{ASK_COPY.pickRow}</p>
      )}
    </section>
  );
}
