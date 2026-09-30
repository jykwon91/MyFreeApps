import { forwardRef } from "react";
import { Map as MapIcon, X } from "lucide-react";
import PoiRow from "@/games/wow-forever/components/worldMap/PoiRow";
import WaypointButtons from "@/games/wow-forever/components/worldMap/WaypointButtons";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { areaLabel } from "@/games/wow-forever/worldMap/describeRank";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

interface GoingToCardProps {
  data: WorldMapData;
  faction: PlayerFaction;
  poiId: string;
  /** null until the player has said where they are — then there are no directions yet. */
  model: WorldMapModel | null;
  onClear: () => void;
  onShowMap: () => void;
}

/** What you searched for, pinned above the lists with its directions open. */
const GoingToCard = forwardRef<HTMLElement, GoingToCardProps>(function GoingToCard(props, ref) {
  const { data, faction, poiId, model, onClear, onShowMap } = props;
  const poi = data.poiById.get(poiId);
  const zone = poi && data.zoneById.get(poi.zone);
  if (!poi || !zone) return null;
  const ranked = model?.selected?.poi.id === poiId ? model.selected : null;

  return (
    <section ref={ref} aria-labelledby="wm-going-to" className="space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wm-going-to" className="text-lg font-semibold">
          Going to
        </h2>
        <button
          type="button"
          onClick={onShowMap}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 lg:hidden"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Show on map
        </button>
      </div>
      {ranked && (
        <PoiRow
          ranked={ranked}
          data={data}
          faction={faction}
          selected
          onToggle={onClear}
          directions={model?.directions}
        />
      )}
      {!ranked && (
        <article aria-label={poi.name} className="rounded-lg border border-blue-500 p-3 space-y-2 ring-2 ring-blue-500/50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="font-semibold">{poi.name}</h3>
              {poi.title && <span className="text-sm text-muted-foreground">{poi.title}</span>}
            </div>
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear selection: ${poi.name}`}
              className="-m-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
              Clear
            </button>
          </div>
          <p className="text-sm">
            {areaLabel(poi, zone)}
            <span className="text-muted-foreground">
              {" "}
              · {formatCoord(poi.x)}, {formatCoord(poi.y)}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">Say where you are (above) to get directions.</p>
          <WaypointButtons target={{ zoneId: zone.id, zoneName: zone.name, x: poi.x, y: poi.y, label: poi.name }} />
        </article>
      )}
    </section>
  );
});

export default GoingToCard;
