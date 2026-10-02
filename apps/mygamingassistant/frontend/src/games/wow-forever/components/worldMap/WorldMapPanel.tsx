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
import {
  resultMarkers,
  selectedOnlyMarkers,
  type MapFit,
  type MapFocus,
  type MapLayerChoice,
  type MapMarker,
  type MapRoute,
} from "@/games/wow-forever/worldMap/mapLayers";
import { clusterFit } from "@/games/wow-forever/worldMap/markerClusters";
import type { PickTarget } from "@/games/wow-forever/worldMap/trip";
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
  /** The chosen result — drawn even before the player has picked a zone. */
  selectedPoiId: string | null;
  focus: MapFocus | null;
  onFocusApplied: () => void;
  /** The trip drawn on the map (B, or A -> stops -> B). */
  route: MapRoute | null;
  /** The zone the trip goes to, for the "Your zone" / "Destination" buttons. */
  destinationZoneId: number | null;
  fit: MapFit | null;
  onFitApplied: () => void;
  /** "Choose on map": the next click on a zone map picks the trip's start ("start") or destination. */
  picking: PickTarget | null;
  onPickPoint: (zoneId: number, x: number, y: number) => void;
  onCancelPick: () => void;
  /** With directions open a click never moves your saved location — trips don't change it. */
  directionsOpen: boolean;
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
  /** Zoom the map to these points, on `fit.mapId` (opening it first). */
  onZoomTo: (fit: MapFit) => void;
  /** "Show all on the map" results: drawn on every map level, in place of the usual results. */
  searchMarkers: readonly MapMarker[] | null;
}

const PICK_PROMPT: Readonly<Record<PickTarget, string>> = {
  start: "Click the map to set your start. Esc to cancel.",
  destination: "Click the map to set your destination. Esc to cancel.",
};

/** The search's markers plus the chosen result when it isn't one of them (picked from another list). */
function withSelected(search: readonly MapMarker[], selected: readonly MapMarker[]): MapMarker[] {
  const ids = new Set(search.map((m) => m.id));
  return [...search, ...selected.filter((m) => !ids.has(m.id))];
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
  // Results belong on zone maps; a continent or the world shows you, the route and the destination —
  // except a "Show all" search, whose matches show at any zoom so you can see where they all are.
  let markers: MapMarker[] = [];
  if (props.searchMarkers) markers = withSelected(props.searchMarkers, selectedOnlyMarkers(props.selectedPoiId, data));
  else if (zoneView && model) markers = resultMarkers(model, layers);
  else if (zoneView) markers = selectedOnlyMarkers(props.selectedPoiId, data);
  const destinationZone = props.destinationZoneId === null ? undefined : data.zoneById.get(props.destinationZoneId);

  const quickJumps: { zone: WorldZone; label: string }[] = [];
  if (model && destinationZone && destinationZone.id !== model.zone.id) {
    quickJumps.push({ zone: model.zone, label: "Your zone" }, { zone: destinationZone, label: `Destination: ${destinationZone.name}` });
  }

  function pick(x: number, y: number) {
    if (props.picking) {
      props.onPickPoint(mapId, x, y);
      return;
    }
    if (props.directionsOpen) return;
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
      {zoneView && !props.searchMarkers && (
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
      {props.picking && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-500 bg-blue-500/10 px-3 py-2 text-sm">
          <span>{PICK_PROMPT[props.picking]}</span>
          <button type="button" onClick={props.onCancelPick} className="rounded-md border bg-card px-3 min-h-[44px] sm:min-h-[32px]">
            Cancel
          </button>
        </div>
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
        // While choosing a spot, a click picks it instead of letting go of the selection.
        selectedId={props.picking ? null : props.selectedPoiId}
        route={props.route}
        focus={props.focus}
        onFocusApplied={props.onFocusApplied}
        fit={props.fit}
        onFitApplied={props.onFitApplied}
        restore={props.restore}
        onRestoreApplied={props.onRestoreApplied}
        onZoomChange={props.onZoomChange}
        onManualZoom={props.onManualZoom}
        onOpen={onOpen}
        onZoomOut={() => map.parent !== null && onOpen(map.parent)}
        onPick={pick}
        onSelectMarker={props.onSelectMarker}
        // Several results on one spot: open the map they separate on (Ironforge from the Eastern Kingdoms), zoomed in.
        onOpenCluster={(members) => props.onZoomTo(clusterFit(data, map, members))}
        onClearSelection={props.onClearSelection}
      />
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-blue-600">●</span> You ·{" "}
        <span className="font-medium text-emerald-600">A</span> start ·{" "}
        <span className="font-medium text-red-600">B</span> destination ·{" "}
        <span className="font-medium text-amber-500">●</span> direction steps (walk solid, fly dashed, boat dotted) ·{" "}
        <span className="font-medium text-cyan-400">●</span> quest givers ·{" "}
        <span className="font-medium text-red-700">●</span> dungeons · other coloured dots are results. With a result selected, a click on the map or Esc clears it and the map goes back to where it
        was — unless you've moved it yourself since.
        Otherwise click a zone to open it; right-click or Esc zooms out. On your zone's map, click to set where you are. Scroll to zoom, drag to
        move.
      </p>
    </section>
  );
}
