import clsx from "clsx";
import { Badge } from "@platform/ui";
import { ChevronDown, MapPin } from "lucide-react";
import DirectionsPanel from "@/games/wow-forever/components/worldMap/DirectionsPanel";
import ProvenanceBadge from "@/games/wow-forever/components/worldMap/ProvenanceBadge";
import WaypointButtons from "@/games/wow-forever/components/worldMap/WaypointButtons";
import { FACTION, type PlayerFaction, type WorldMapData } from "@/games/wow-forever/types/worldMap";
import { areaLabel, distanceLabel, poiWaypoint } from "@/games/wow-forever/worldMap/describeRank";
import type { Directions } from "@/games/wow-forever/worldMap/directions";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";
import type { RankedPoi } from "@/games/wow-forever/worldMap/nearest";

interface PoiRowProps {
  ranked: RankedPoi;
  data: WorldMapData;
  faction: PlayerFaction;
  /** Shown above the name in the hero list ("Warlock trainer"). */
  heading?: string;
  selected: boolean;
  onToggle: (poiId: string) => void;
  /** Directions for the selected row. */
  directions: Directions | null | undefined;
}

export default function PoiRow({ ranked, data, faction, heading, selected, onToggle, directions }: PoiRowProps) {
  const { poi, zone } = ranked;
  const panelId = `wm-directions-${poi.id}`;
  return (
    <article
      aria-label={`${heading ? `${heading}: ` : ""}${poi.name}`}
      className={clsx("rounded-lg border p-3 space-y-2", selected && "border-primary ring-1 ring-primary")}
    >
      {heading && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-semibold">{poi.name}</h3>
        {poi.title && <span className="text-sm text-muted-foreground">{poi.title}</span>}
      </div>
      <p className="flex items-start gap-1.5 text-sm">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {areaLabel(poi, zone)} ({formatCoord(poi.x)}, {formatCoord(poi.y)}) · {distanceLabel(ranked, data)}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <ProvenanceBadge poi={poi} />
        {poi.faction === FACTION.neutral && <Badge color="purple" label="Neutral town — both factions" />}
        {poi.faction !== FACTION.neutral && poi.faction !== faction && <Badge color="red" label="Other faction" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onToggle(poi.id)}
          aria-expanded={selected}
          aria-controls={panelId}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] transition-colors",
            selected && "bg-primary text-primary-foreground",
            !selected && "hover:bg-muted/40",
          )}
        >
          Directions &amp; map
          <ChevronDown className={clsx("h-4 w-4 transition-transform", selected && "rotate-180")} aria-hidden />
        </button>
        <WaypointButtons target={poiWaypoint(ranked)} />
      </div>
      {selected && directions !== undefined && (
        <div id={panelId} className="border-t pt-3">
          <DirectionsPanel directions={directions} />
        </div>
      )}
    </article>
  );
}
