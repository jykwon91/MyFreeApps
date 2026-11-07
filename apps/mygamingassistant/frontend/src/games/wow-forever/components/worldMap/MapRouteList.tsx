import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import type { RouteDistance } from "@/games/wow-forever/types/mapMarks/routeDistance";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";

interface MapRouteListProps {
  stops: readonly MapMark[];
  distance: RouteDistance;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}

const ICON_BUTTON =
  "inline-flex items-center justify-center rounded-md border min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] hover:bg-muted/40 disabled:opacity-40 disabled:hover:bg-transparent";

/** Your route, in order: each stop with the straight-line yards from the one before, up / down / remove, and the total. */
export default function MapRouteList({ stops, distance, onMove, onRemove, onClear }: MapRouteListProps) {
  return (
    <div className="space-y-2" data-testid="my-route">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">My route</h4>
        <button type="button" onClick={onClear} className="rounded-md border px-3 text-xs min-h-[44px] sm:min-h-[32px] hover:bg-muted/40">
          Clear route
        </button>
      </div>
      <ol className="space-y-1">
        {stops.map((mark, i) => {
          const leg = i === 0 ? undefined : distance.legs[i - 1];
          return (
            <li key={mark.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{mark.label}</span>
                {leg !== undefined && (
                  <span className="block text-xs text-muted-foreground">{leg === null ? "Can't measure this leg" : `${formatYards(leg)} from stop ${i}`}</span>
                )}
              </span>
              <button type="button" disabled={i === 0} onClick={() => onMove(i, -1)} aria-label={`Move stop ${i + 1} up`} className={ICON_BUTTON}>
                <ArrowUp aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={i === stops.length - 1}
                onClick={() => onMove(i, 1)}
                aria-label={`Move stop ${i + 1} down`}
                className={ICON_BUTTON}
              >
                <ArrowDown aria-hidden className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove stop ${i + 1} from the route`} className={ICON_BUTTON}>
                <X aria-hidden className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ol>
      {stops.length > 1 && (
        <p className="text-sm" data-testid="my-route-total">
          {distance.total === null ? (
            "This map can't measure the whole route in yards."
          ) : (
            <>
              <span className="font-semibold">{formatYards(distance.total)}</span> straight-line
            </>
          )}
        </p>
      )}
      {stops.length > 1 && (
        <p className="text-xs text-muted-foreground">Straight-line distance. Hills, water and enemy camps can make the walk longer.</p>
      )}
      {stops.length === 1 && <p className="text-xs text-muted-foreground">Add another mark to draw the route.</p>}
    </div>
  );
}
