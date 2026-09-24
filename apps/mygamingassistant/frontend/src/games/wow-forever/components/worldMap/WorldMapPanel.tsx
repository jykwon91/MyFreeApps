import { useState } from "react";
import clsx from "clsx";
import ChildMapSelect from "@/games/wow-forever/components/worldMap/ChildMapSelect";
import MapBreadcrumb from "@/games/wow-forever/components/worldMap/MapBreadcrumb";
import MapCanvas from "@/games/wow-forever/components/worldMap/MapCanvas";
import PositionConfirm from "@/games/wow-forever/components/worldMap/PositionConfirm";
import type { ZoomView } from "@/hooks/useMinimapZoomPan";
import type { MapZoomRestore } from "@/games/wow-forever/hooks/useMapSelection";
import type { PlayerFaction, WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { childrenOf, isZoneView, mapPath } from "@/games/wow-forever/worldMap/mapHitTest";
import { directionStops, resultMarkers, type MapFocus, type MapLayerChoice } from "@/games/wow-forever/worldMap/mapLayers";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

interface WorldMapPanelProps {
  data: WorldMapData;
  /** null until the player has picked a zone. */
  model: WorldMapModel | null;
  faction: PlayerFaction;
  /** The viewed map (from the URL). */
  mapId: number;
  /** The player's saved zone. */
  playerZoneId: number | null;
  focus: MapFocus | null;
  onFocusApplied: () => void;
  restore: MapZoomRestore | null;
  onRestoreApplied: () => void;
  onZoomChange: (zoom: ZoomView) => void;
  onManualZoom: () => void;
  onOpen: (mapId: number) => void;
  onSetPosition: (zoneId: number, x: number, y: number) => void;
  onSelectMarker: (poiId: string) => void;
  /** Esc or a click on the map with a result selected: clear it. */
  onClearSelection: () => void;
  /** Which optional layers are drawn (owned by the page so Reset filters can restore them). */
  layers: MapLayerChoice;
  onLayersChange: (layers: MapLayerChoice) => void;
}

interface PendingSpot {
  mapId: number;
  x: number;
  y: number;
}

/** The map beside the list: navigable from Azeroth down to a city, with you, the results and the route. */
export default function WorldMapPanel(props: WorldMapPanelProps) {
  const { data, model, faction, mapId, playerZoneId, onOpen, onSetPosition, layers, onLayersChange } = props;
  const [pending, setPending] = useState<PendingSpot | null>(null);
  const map = data.maps.get(mapId) ?? data.maps.get(data.worldMapId);
  if (!map) return null;
  const zoneView = isZoneView(map);
  // Results belong on zone maps; a continent or the world shows you, the route and the destination.
  const markers = model && zoneView ? resultMarkers(model, layers) : [];
  const stops = model ? directionStops(model, data) : [];
  const selected = model?.selected ?? null;
  const destination = selected && { world: selected.world, label: selected.poi.name };

  const quickJumps: { zone: WorldZone; label: string }[] = [];
  if (model && selected && selected.zone.id !== model.zone.id) {
    quickJumps.push({ zone: model.zone, label: "Your zone" }, { zone: selected.zone, label: `Destination: ${selected.zone.name}` });
  }

  function pick(x: number, y: number) {
    // Your own zone (or no zone yet): a click says where you are. Anywhere else, ask first.
    if (playerZoneId === null || playerZoneId === mapId) onSetPosition(mapId, x, y);
    else setPending({ mapId, x, y });
  }

  const confirm = pending?.mapId === mapId ? pending : null;

  return (
    <section aria-labelledby="wm-map" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wm-map" className="text-lg font-semibold">
          Map: {map.name}
        </h2>
        {quickJumps.length > 0 && (
          <div role="group" aria-label="Which map" className="flex gap-2">
            {quickJumps.map(({ zone, label }) => (
              <button
                key={zone.id}
                type="button"
                aria-pressed={zone.id === mapId}
                onClick={() => onOpen(zone.id)}
                className={clsx(
                  "rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px]",
                  zone.id === mapId && "bg-primary text-primary-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MapBreadcrumb path={mapPath(data, map.id)} onOpen={onOpen} />
        <ChildMapSelect maps={childrenOf(data, map.id)} onOpen={onOpen} />
      </div>
      {zoneView && (
        <fieldset className="flex flex-wrap items-center gap-x-4 text-sm">
          <legend className="sr-only">Also show on the map</legend>
          <span className="text-muted-foreground">Also show:</span>
          <label className="flex items-center gap-2 min-h-[44px] sm:min-h-[32px]">
            <input
              type="checkbox"
              checked={layers.questGivers}
              onChange={(e) => onLayersChange({ ...layers, questGivers: e.target.checked })}
              className="h-4 w-4"
            />
            Quest givers
          </label>
          <label className="flex items-center gap-2 min-h-[44px] sm:min-h-[32px]">
            <input
              type="checkbox"
              checked={layers.instances}
              onChange={(e) => onLayersChange({ ...layers, instances: e.target.checked })}
              className="h-4 w-4"
            />
            Dungeons &amp; raids
          </label>
        </fieldset>
      )}
      {confirm && (
        <PositionConfirm
          zoneName={map.name}
          x={confirm.x}
          y={confirm.y}
          onConfirm={() => {
            setPending(null);
            onSetPosition(confirm.mapId, confirm.x, confirm.y);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      <MapCanvas
        key={map.id}
        data={data}
        map={map}
        faction={faction}
        player={model?.player.world ?? null}
        markers={markers}
        selectedId={selected?.poi.id ?? null}
        destination={destination}
        stops={stops}
        focus={props.focus}
        onFocusApplied={props.onFocusApplied}
        restore={props.restore}
        onRestoreApplied={props.onRestoreApplied}
        onZoomChange={props.onZoomChange}
        onManualZoom={props.onManualZoom}
        onOpen={onOpen}
        onZoomOut={() => map.parent !== null && onOpen(map.parent)}
        onPick={pick}
        onSelectMarker={props.onSelectMarker}
        onClearSelection={props.onClearSelection}
      />
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-blue-600">●</span> You ·{" "}
        <span className="font-medium text-amber-500">●</span> direction steps, joined by a dashed route ·{" "}
        <span className="font-medium text-fuchsia-500">●</span> destination on a wider map ·{" "}
        <span className="font-medium text-cyan-400">●</span> quest givers ·{" "}
        <span className="font-medium text-red-700">●</span> dungeons · other coloured dots are results. With a result selected, a click on the map or Esc clears it and the map goes back to where it
        was — unless you've moved it yourself since.
        Otherwise click a zone to open it; right-click or Esc zooms out. On your zone's map, click to set where you are. Scroll to zoom, drag to
        move.
      </p>
    </section>
  );
}
