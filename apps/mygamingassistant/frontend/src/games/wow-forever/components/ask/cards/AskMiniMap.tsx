import clsx from "clsx";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";

interface AskMiniMapProps {
  zoneId: number;
  zoneName: string;
  /** The card's rows on this zone. */
  rows: readonly AskNpcRow[];
  selectedId: string | null;
  /** Drawn as "You" when it's on this zone. */
  origin: AskOrigin | null;
}

function spot(x: number, y: number): { left: string; top: string } {
  return { left: `${x}%`, top: `${y}%` };
}

/**
 * A still picture of one zone's map with the card's results numbered like the
 * list, and "You" when the start is on it. Only for showing where — the list
 * is what you pick from, and "Route there" opens the real World Map.
 */
export default function AskMiniMap({ zoneId, zoneName, rows, selectedId, origin }: AskMiniMapProps) {
  const showOrigin = origin !== null && origin.zoneId === zoneId;
  return (
    <figure className="relative w-full overflow-hidden rounded-lg border bg-muted/30" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
      <img
        src={`/wow-maps/${zoneId}.webp`}
        alt={ASK_COPY.cardMapAlt(zoneName)}
        width={MAP_W}
        height={MAP_H}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {showOrigin ? (
        <span
          aria-hidden
          data-testid="ask-map-you"
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-2 ring-white"
          style={spot(origin.x, origin.y)}
        >
          {ASK_COPY.youMarker}
        </span>
      ) : null}
      {rows.map((row) => (
        <span
          key={row.poiId}
          aria-hidden
          data-testid="ask-map-marker"
          className={clsx(
            "absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white",
            row.poiId === selectedId ? "z-10 scale-125 bg-red-600 text-white" : "bg-amber-400 text-black",
          )}
          style={spot(row.x, row.y)}
        >
          {row.n}
        </span>
      ))}
    </figure>
  );
}
