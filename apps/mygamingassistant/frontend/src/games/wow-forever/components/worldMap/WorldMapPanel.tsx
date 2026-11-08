import { useMemo, useState } from "react";
import clsx from "clsx";
import { AlertBox } from "@platform/ui";
import ChildMapSelect from "@/games/wow-forever/components/worldMap/ChildMapSelect";
import MapBreadcrumb from "@/games/wow-forever/components/worldMap/MapBreadcrumb";
import LevelFitLegend from "@/games/wow-forever/components/worldMap/LevelFitLegend";
import MapCanvas from "@/games/wow-forever/components/worldMap/MapCanvas";
import MapContextMenu from "@/games/wow-forever/components/worldMap/MapContextMenu";
import MapLayersControl from "@/games/wow-forever/components/worldMap/MapLayersControl";
import RareMapCard from "@/games/wow-forever/components/rares/RareMapCard";
import MapLegendNote from "@/games/wow-forever/components/worldMap/MapLegendNote";
import MyMarksPanel from "@/games/wow-forever/components/worldMap/MyMarksPanel";
import SharedViewBanner from "@/games/wow-forever/components/worldMap/SharedViewBanner";
import ShareViewButton from "@/games/wow-forever/components/worldMap/ShareViewButton";
import PositionConfirm from "@/games/wow-forever/components/worldMap/PositionConfirm";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { RARES_STATUS } from "@/games/wow-forever/data/rares/raresConfig";
import { MAP_LAYER } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { GATHERING_SPOTS_STATUS, useGatheringMapSpots } from "@/games/wow-forever/hooks/useGatheringMapSpots";
import type { MapLayersState } from "@/games/wow-forever/hooks/useMapLayers";
import { useRares } from "@/games/wow-forever/hooks/useRares";
import { useMapMarkTools } from "@/games/wow-forever/hooks/useMapMarkTools";
import type { MapMarksState } from "@/games/wow-forever/hooks/useMapMarks";
import type { SharedMapViewState } from "@/games/wow-forever/hooks/useSharedMapView";
import type { MapZoomRestore } from "@/games/wow-forever/hooks/useMapSelection";
import type { LazyLayerSource } from "@/games/wow-forever/types/mapLayers/lazyLayerSource";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";
import { MAP_KIND, type PlayerFaction, type WorldMapData, type WorldZone } from "@/games/wow-forever/types/worldMap";
import { layerCounts, markersByLayer, mergeMarkers, visibleLayerMarkers } from "@/games/wow-forever/worldMap/layerMarkers";
import { childrenOf, isZoneView, mapPath } from "@/games/wow-forever/worldMap/mapHitTest";
import {
  resultMarkers,
  selectedOnlyMarkers,
  type MapFit,
  type MapFocus,
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
  onZoomChange: (view: MapViewport) => void;
  onManualZoom: () => void;
  onOpen: (mapId: number) => void;
  onSetPosition: (zoneId: number, x: number, y: number) => void;
  onSelectMarker: (poiId: string) => void;
  /** Esc or a click on the map with a result selected: clear it. */
  onClearSelection: () => void;
  /** Which layers are drawn and the level tint (owned by the page so Reset filters can restore them). */
  mapLayers: MapLayersState;
  classId: WowClassId;
  /** The player's saved level — the You section's, shared both ways. */
  level: number | null;
  onLevelChange: (level: number | null) => void;
  /** Zoom the map to these points, on `fit.mapId` (opening it first). */
  onZoomTo: (fit: MapFit) => void;
  /** "Show all on the map" results: drawn on every map level, in place of the usual results. */
  searchMarkers: readonly MapMarker[] | null;
  /** Your marks + route on the viewed map. */
  marks: MapMarksState;
  /** A "Share this view" link that was opened: its read-only marks, its layer preview, or "this link doesn't work". */
  sharedView: SharedMapViewState;
}

const PICK_PROMPT: Readonly<Record<PickTarget, string>> = {
  start: "Click the map to set your start. Esc to cancel.",
  destination: "Click the map to set your destination. Esc to cancel.",
};

interface PendingSpot {
  mapId: number;
  x: number;
  y: number;
}

/** The map beside the list: navigable from Azeroth down to a city, with you, the results and the route. */
export default function WorldMapPanel(props: WorldMapPanelProps) {
  const { data, model, faction, mapId, playerZoneId, onOpen, onSetPosition, mapLayers, classId, level, marks, sharedView } = props;
  const { settings } = mapLayers;
  const [pending, setPending] = useState<PendingSpot | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const map = data.maps.get(mapId) ?? data.maps.get(data.worldMapId);
  const gatheringOn = settings.layers[MAP_LAYER.herbs] || settings.layers[MAP_LAYER.ore];
  const gathering = useGatheringMapSpots(layersOpen || gatheringOn);
  const raresState = useRares(layersOpen || settings.layers[MAP_LAYER.rares]);
  const rares = raresState.status === RARES_STATUS.ready ? raresState.data.rares : null;
  const lazy = useMemo(() => ({ gathering: gathering.spots, rares }), [gathering.spots, rares]);
  const byLayer = useMemo(
    () => (map ? markersByLayer(data, map, { faction, classId, level, ...lazy }) : null),
    [data, map, faction, classId, level, lazy],
  );
  const counts = useMemo(() => byLayer && layerCounts(byLayer, lazy), [byLayer, lazy]);
  const failedSources = useMemo(() => {
    const failed = new Set<LazyLayerSource>();
    if (gathering.status === GATHERING_SPOTS_STATUS.error) failed.add("gathering");
    if (raresState.status === RARES_STATUS.error) failed.add("rares");
    return failed;
  }, [gathering.status, raresState.status]);
  const tools = useMapMarkTools(map?.id ?? mapId, marks, mapLayers, sharedView);
  if (!map || !byLayer || !counts) return null;
  const zoneView = isZoneView(map);
  const continentView = map.kind === MAP_KIND.continent;
  const layerMarkers = visibleLayerMarkers(byLayer, settings.layers);
  // Layers show on every map. Your results belong on zone maps; a continent or the world shows you, the route
  // and the destination — except a "Show all" search, whose matches (drawn instead of the layers) show at any zoom.
  let markers: MapMarker[] = layerMarkers;
  if (props.searchMarkers) markers = mergeMarkers(props.searchMarkers, selectedOnlyMarkers(props.selectedPoiId, data));
  else if (zoneView && model) markers = mergeMarkers(resultMarkers(model), layerMarkers);
  else if (zoneView) markers = mergeMarkers(selectedOnlyMarkers(props.selectedPoiId, data), layerMarkers);
  const continent = continentView ? null : (mapPath(data, map.id).find((m) => m.kind === MAP_KIND.continent) ?? null);
  const fitLevel = settings.levelFit ? level : null;
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
  const parent = map.parent === null ? undefined : data.maps.get(map.parent);
  const shared = sharedView.shared;
  const sharedMap = shared ? data.maps.get(shared.mapId) : undefined;

  return (
    <section aria-labelledby="wm-map" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wm-map" className="text-lg font-semibold">
          Map: {map.name}
        </h2>
        <ShareViewButton makeUrl={tools.shareUrl} />
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
      {sharedView.invalid && (
        <AlertBox variant="warning">
          That shared map link doesn't work — it may have been cut short when it was pasted. Showing your own map instead.{" "}
          <button type="button" onClick={sharedView.dismissInvalid} className="underline min-h-[44px]">
            Dismiss
          </button>
        </AlertBox>
      )}
      {(shared || mapLayers.previewing) && (
        <SharedViewBanner
          shared={shared}
          mapName={sharedMap?.name ?? map.name}
          onSharedMap={!shared || shared.mapId === map.id}
          previewing={mapLayers.previewing}
          onSave={tools.saveShared}
          onDismiss={sharedView.dismissShared}
          onOpenMap={() => shared && onOpen(shared.mapId)}
          onKeepLayers={mapLayers.keepPreview}
          onUseMyLayers={mapLayers.endPreview}
        />
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
        onZoomChange={(view) => {
          props.onZoomChange(view);
          tools.trackView(view);
        }}
        onManualZoom={props.onManualZoom}
        onOpen={onOpen}
        onZoomOut={() => map.parent !== null && onOpen(map.parent)}
        onPick={pick}
        onSelectMarker={props.onSelectMarker}
        // Several results on one spot: open the map they separate on (Ironforge from the Eastern Kingdoms), zoomed in.
        onOpenCluster={(members) => props.onZoomTo(clusterFit(data, map, members))}
        onClearSelection={props.onClearSelection}
        zoneFitLevel={continentView ? fitLevel : null}
        marks={marks.marks}
        sharedMarks={shared?.mapId === map.id ? shared.marks : null}
        onMenu={tools.openMenu}
        placing={tools.placing}
        onPlace={tools.place}
        onCancelPlace={() => tools.setPlacing(false)}
        overlay={
          <>
          <MapLayersControl
            open={layersOpen}
            onOpenChange={setLayersOpen}
            mapName={map.name}
            settings={settings}
            counts={counts}
            classId={classId}
            failedSources={failedSources}
            onSetLayers={mapLayers.setLayers}
            onRetryLoad={gathering.retry}
            level={level}
            onLevelChange={props.onLevelChange}
            onLevelFitChange={mapLayers.setLevelFit}
            continentView={continentView}
            continent={continent}
            onOpen={onOpen}
            searchActive={props.searchMarkers !== null}
          />
          {tools.menu && (
            <MapContextMenu
              target={tools.menu}
              canAdd={marks.room > 0}
              parentName={parent?.name ?? null}
              onAdd={tools.addFromMenu}
              onCopy={tools.copyFromMenu}
              onZoomOut={() => {
                tools.closeMenu();
                if (parent) onOpen(parent.id);
              }}
              onClose={tools.closeMenu}
            />
          )}
          </>
        }
      />
      {continentView && fitLevel !== null && <LevelFitLegend level={fitLevel} compact />}
      <RareMapCard rares={rares} selectedId={props.selectedPoiId} />
      <MyMarksPanel
        map={map}
        state={marks}
        open={tools.panelOpen}
        onOpenChange={tools.setPanelOpen}
        placing={tools.placing}
        onPlacingChange={tools.setPlacing}
        onAddAtCentre={tools.addAtCentre}
        focusId={tools.focusId}
        onFocused={tools.clearFocusId}
      />
      <MapLegendNote />
    </section>
  );
}
