import clsx from "clsx";
import { askMapPins, pinTitle } from "@/games/wow-forever/lib/ask/askMapPins";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { AskMapRow } from "@/games/wow-forever/types/ask/askMapRow";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";

interface AskMiniMapProps {
  zoneId: number;
  zoneName: string;
  /** The card's rows on this zone. */
  rows: readonly AskMapRow[];
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
      {askMapPins(rows, selectedId).map((pin) =>
        pin.rows.length > 1 ? (
          <span
            key={pin.id}
            aria-hidden
            data-testid="ask-map-cluster"
            title={pinTitle(pin)}
            className={clsx(
              "absolute z-20 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-1 text-xs font-bold text-white ring-2 ring-white",
              pin.nudged ? "translate-x-2 translate-y-2" : "-translate-x-1/2 -translate-y-1/2",
            )}
            style={spot(pin.x, pin.y)}
          >
            ×{pin.rows.length}
          </span>
        ) : (
          <span
            key={pin.id}
            aria-hidden
            data-testid="ask-map-marker"
            className={clsx(
              "absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white",
              pin.id === selectedId ? "z-10 scale-125 bg-red-600 text-white" : "bg-amber-400 text-black",
            )}
            style={spot(pin.x, pin.y)}
          >
            {pin.rows[0].n}
          </span>
        ),
      )}
    </figure>
  );
}
