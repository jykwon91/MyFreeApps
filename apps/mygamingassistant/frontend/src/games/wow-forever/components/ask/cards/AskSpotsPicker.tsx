import { useState } from "react";
import { Link } from "react-router-dom";
import { Map as MapIcon, Navigation } from "lucide-react";
import AskMiniMap from "@/games/wow-forever/components/ask/cards/AskMiniMap";
import AskSpotRowButton from "@/games/wow-forever/components/ask/cards/AskSpotRowButton";
import { ASK_PRIMARY_ACTION, ASK_SECONDARY_ACTION } from "@/games/wow-forever/components/ask/cards/askCardStyles";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { routeToSpotHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { AskSpotRow } from "@/games/wow-forever/types/ask/askSpotRow";

interface AskSpotsPickerProps {
  rows: readonly AskSpotRow[];
  origin: AskOrigin | null;
}

/**
 * Numbered spots on a small map of the picked one's zone (the first one's
 * until you pick). Picking a row shows "Route there" — the World Map with
 * directions to the spot — and "Show on the World Map" when the row has one.
 */
export default function AskSpotsPicker({ rows, origin }: AskSpotsPickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const shown = selected ?? rows[0];
  const markers = rows
    .filter((row) => row.zoneId === shown.zoneId)
    .map((row) => ({ poiId: row.id, n: row.n, name: row.name, x: row.x, y: row.y }));
  const toggle = (id: string) => setSelectedId((current) => (current === id ? null : id));

  return (
    <>
      <AskMiniMap zoneId={shown.zoneId} zoneName={shown.zoneName} rows={markers} selectedId={selectedId} origin={origin} />
      <ol className="space-y-1">
        {rows.map((row) => (
          <AskSpotRowButton key={row.id} row={row} selected={row.id === selectedId} onToggle={toggle} />
        ))}
      </ol>
      {selected ? (
        <div className="flex flex-wrap gap-2">
          <Link to={routeToSpotHref(selected, origin)} className={ASK_PRIMARY_ACTION}>
            <Navigation className="h-4 w-4" aria-hidden />
            {ASK_COPY.routeThere}
          </Link>
          {selected.mapHref ? (
            <Link to={selected.mapHref} className={ASK_SECONDARY_ACTION}>
              <MapIcon className="h-4 w-4" aria-hidden />
              {ASK_COPY.showOnMap}
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{ASK_COPY.pickRow}</p>
      )}
    </>
  );
}
