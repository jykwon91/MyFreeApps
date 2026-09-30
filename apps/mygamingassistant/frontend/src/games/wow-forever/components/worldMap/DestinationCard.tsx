import { Map as MapIcon, Route, X } from "lucide-react";
import { DESTINATION_DIRECTIONS_ID } from "@/games/wow-forever/components/worldMap/plannerIds";
import WaypointButtons from "@/games/wow-forever/components/worldMap/WaypointButtons";
import type { ResolvedEnd } from "@/games/wow-forever/worldMap/trip";

interface DestinationCardProps {
  destination: ResolvedEnd;
  onDirections: () => void;
  onClear: () => void;
  onShowMap: () => void;
}

/** The place or NPC you searched for, like a maps app's place card: where it is, and a Directions button. */
export default function DestinationCard({ destination, onDirections, onClear, onShowMap }: DestinationCardProps) {
  const { place } = destination.route;

  return (
    <article aria-labelledby="wm-destination" className="rounded-lg border border-red-500/70 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 id="wm-destination" className="text-lg font-semibold">
            {destination.title}
          </h2>
          {destination.subtitle && <span className="text-sm text-muted-foreground">{destination.subtitle}</span>}
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear destination: ${destination.title}`}
          className="-m-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
          Clear
        </button>
      </div>
      <p className="text-sm">{destination.detail}</p>
      {destination.note && <p className="text-sm text-muted-foreground">{destination.note}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          id={DESTINATION_DIRECTIONS_ID}
          type="button"
          onClick={onDirections}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground min-h-[44px] sm:min-h-[36px]"
        >
          <Route className="h-4 w-4" aria-hidden />
          Directions
        </button>
        <button
          type="button"
          onClick={onShowMap}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[36px] hover:bg-muted/40 lg:hidden"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Show on map
        </button>
        <WaypointButtons target={{ zoneId: place.zoneId, zoneName: place.zoneName, x: place.x, y: place.y, label: place.label }} />
      </div>
    </article>
  );
}
