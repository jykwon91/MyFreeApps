import { useCallback, useMemo, useState } from "react";
import { AlertBox, useIsAuthenticated } from "@platform/ui";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import AddonHelp from "@/games/wow-forever/components/worldMap/AddonHelp";
import CaptureImport from "@/games/wow-forever/components/worldMap/CaptureImport";
import FindServices from "@/games/wow-forever/components/worldMap/FindServices";
import ForeverNotes from "@/games/wow-forever/components/worldMap/ForeverNotes";
import InstanceList from "@/games/wow-forever/components/worldMap/InstanceList";
import MapSearchResults from "@/games/wow-forever/components/worldMap/MapSearchResults";
import QuestGivers from "@/games/wow-forever/components/worldMap/QuestGivers";
import NearestServices from "@/games/wow-forever/components/worldMap/NearestServices";
import PlayerStrip from "@/games/wow-forever/components/worldMap/PlayerStrip";
import RoutePlanner from "@/games/wow-forever/components/worldMap/RoutePlanner";
import WorldMapPanel from "@/games/wow-forever/components/worldMap/WorldMapPanel";
import WorldMapSkeleton from "@/games/wow-forever/components/worldMap/WorldMapSkeleton";
import { useFindFilters } from "@/games/wow-forever/hooks/useFindFilters";
import { useMapSearch } from "@/games/wow-forever/hooks/useMapSearch";
import { useMapSelection } from "@/games/wow-forever/hooks/useMapSelection";
import { useMapView } from "@/games/wow-forever/hooks/useMapView";
import { usePlayerSettings, type PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useTravelSettings } from "@/games/wow-forever/hooks/useTravelSettings";
import { useTripPlanner } from "@/games/wow-forever/hooks/useTripPlanner";
import { useWorldMap } from "@/games/wow-forever/hooks/useWorldMap";
import { LOAD_STATUS } from "@/games/wow-forever/hooks/useWorldMapData";
import { isReadOnly } from "@/lib/readOnly";
import type { MapFit } from "@/games/wow-forever/worldMap/mapLayers";
import { buildPlaces } from "@/games/wow-forever/worldMap/places";
import { nextWarlockTraining } from "@/games/wow-forever/worldMap/training";
import { buildWorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

const MAP_PANEL_ID = "wm-map-panel";

/** /wow-forever/map — where is the nearest trainer / flight master / bank, and how do I get there. */
export default function WowWorldMapPage() {
  const { status, data, retry, capturesFailed } = useWorldMap();
  const canImport = useIsAuthenticated() && !isReadOnly();
  const [settings, updateSettings] = usePlayerSettings();
  const find = useFindFilters();
  const { findFilterId, showAllClasses, includeOtherFaction } = find.filters;
  const view = useMapView(data, settings.zoneId);
  const selection = useMapSelection(data, view);
  const { selectedPoiId } = selection;
  const places = useMemo(() => (data ? buildPlaces(data) : []), [data]);

  const model = useMemo(
    () =>
      data &&
      buildWorldMapModel(data, {
        faction: settings.faction,
        classId: settings.classId,
        zoneId: settings.zoneId,
        level: settings.level,
        position: settings.position,
        findFilterId,
        showAllClasses,
        includeOtherFaction,
        selectedPoiId,
      }),
    [data, settings, findFilterId, showAllClasses, includeOtherFaction, selectedPoiId],
  );

  // A `?npc=` / `?to=` link, a search pick or a row's Directions: the trip, drawn on the map.
  const travel = useTravelSettings();
  const planner = useTripPlanner({ data, places, faction: settings.faction, travel: travel.options, model, updateSettings });

  const searchContext = useMemo(
    () => ({ faction: settings.faction, player: model?.player ?? null }),
    [settings.faction, model?.player],
  );
  // "warlock trainer" -> Show all on the map: every match, listed and marked at any zoom.
  const mapSearch = useMapSearch({ data, faction: settings.faction, player: searchContext.player, goTo: view.goTo });
  const { clearFit: clearSearchFit } = mapSearch;
  const { clearFit: clearTripFit } = planner;
  // A numbered marker clicked: the view zooms in on what it stood for.
  const [markerFit, setMarkerFit] = useState<MapFit | null>(null);
  const clearFits = useCallback(() => {
    setMarkerFit(null);
    clearSearchFit();
    clearTripFit();
  }, [clearSearchFit, clearTripFit]);
  function zoomTo(fit: MapFit) {
    view.goTo(fit.mapId);
    setMarkerFit(fit);
  }

  /** The strip changing your zone brings the map back to it; browsing the map never changes your zone. */
  function changeSettings(patch: Partial<PlayerSettings>) {
    updateSettings(patch);
    if (patch.zoneId !== undefined && patch.zoneId !== settings.zoneId) view.followPlayer();
  }

  /** Back to the default finding filters with nothing selected (and the view from before it); the You section is kept. */
  function resetFilters() {
    find.reset();
    selection.clear();
  }

  const training = nextWarlockTraining(settings.classId, settings.level);
  const rowProps = {
    data,
    faction: settings.faction,
    selectedPoiId,
    onToggle: selection.toggle,
    onDirections: planner.directionsTo,
  };
  const showMap = () => document.getElementById(MAP_PANEL_ID)?.scrollIntoView({ block: "start" });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
      <WowPageHeader
        title="World Map"
        subtitle="Find the nearest trainer, flight master, inn, bank, quest or dungeon — and how to get there."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      {status === LOAD_STATUS.loading && <WorldMapSkeleton />}
      {status === LOAD_STATUS.error && (
        <AlertBox variant="error">
          The map data didn't load.{" "}
          <button type="button" onClick={retry} className="underline min-h-[44px]">
            Try again
          </button>
        </AlertBox>
      )}
      {data && (
        <>
          <RoutePlanner
            planner={planner}
            data={data}
            places={places}
            context={searchContext}
            faction={settings.faction}
            travel={travel}
            currentZoneId={settings.zoneId}
            onShowMap={showMap}
            onShowAll={mapSearch.show}
          />
          {planner.linkMissing && (
            <AlertBox variant="info">That link's destination isn't on the map. Search for it by name above.</AlertBox>
          )}
          <PlayerStrip data={data} settings={settings} places={places} onChange={changeSettings} />
          {capturesFailed && (
            <p className="text-sm text-muted-foreground">
              Locations recorded in Forever didn't load — showing Classic locations only.
            </p>
          )}
          {model?.zone.foreverOnly && (
            <AlertBox variant="warning">
              {model.zone.name} is new in Forever and not mapped yet — the results below are the nearest known places outside it.
            </AlertBox>
          )}
          {model?.usingZoneCentre && (
            <p className="text-sm text-muted-foreground">
              Measuring from the middle of {model.zone.name}. Click the map or enter your coordinates for better results.
            </p>
          )}
          {model && training && <p className="text-sm">{training}</p>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-8">
              {mapSearch.search && mapSearch.view && (
                <MapSearchResults
                  key={`${mapSearch.search.query}-${mapSearch.includeOtherFaction}`}
                  data={data}
                  faction={settings.faction}
                  search={mapSearch.search}
                  view={mapSearch.view}
                  measured={model !== null}
                  includeOtherFaction={mapSearch.includeOtherFaction}
                  onIncludeOtherFactionChange={mapSearch.setIncludeOtherFaction}
                  selectedPoiId={selectedPoiId}
                  onToggle={selection.toggle}
                  onDirections={planner.directionsTo}
                  onShowAll={mapSearch.fitAll}
                  onClear={mapSearch.clear}
                />
              )}
              {!model && (
                <AlertBox variant="info">
                  Say where you are above — a town like "Goldshire" or your coordinates — or open your zone on the map and click where you are, to see what's nearest to you.
                </AlertBox>
              )}
              {model && (
                <>
                  <NearestServices {...rowProps} data={data} rows={model.hero} />
                  <FindServices
                    {...rowProps}
                    data={data}
                    classId={settings.classId}
                    filter={model.findFilter}
                    onFilterChange={(id) => find.update({ findFilterId: id })}
                    showAllClasses={showAllClasses}
                    onShowAllClassesChange={(value) => find.update({ showAllClasses: value })}
                    includeOtherFaction={includeOtherFaction}
                    onIncludeOtherFactionChange={(value) => find.update({ includeOtherFaction: value })}
                    canReset={!find.atDefaults || selectedPoiId !== null}
                    onReset={resetFilters}
                    results={model.findResults}
                  />
                  <QuestGivers {...rowProps} data={data} level={settings.level} givers={model.questGivers} />
                  <InstanceList {...rowProps} data={data} level={settings.level} instances={model.instances} />
                </>
              )}
            </div>
            {view.mapId !== null && (
              <div id={MAP_PANEL_ID} className="lg:sticky lg:top-4 scroll-mt-4">
                <WorldMapPanel
                  data={data}
                  model={model}
                  faction={settings.faction}
                  mapId={view.mapId}
                  playerZoneId={settings.zoneId}
                  selectedPoiId={selectedPoiId}
                  focus={selection.focus}
                  onFocusApplied={selection.clearFocus}
                  route={planner.route}
                  destinationZoneId={planner.to?.route.place.zoneId ?? null}
                  fit={markerFit ?? mapSearch.fit ?? planner.fit}
                  onZoomTo={zoomTo}
                  onFitApplied={clearFits}
                  picking={planner.picking}
                  onPickPoint={planner.pickPoint}
                  onCancelPick={planner.cancelPick}
                  directionsOpen={planner.directionsOpen}
                  restore={selection.restore}
                  onRestoreApplied={selection.clearRestore}
                  onZoomChange={selection.trackZoom}
                  onManualZoom={selection.takeControl}
                  onOpen={view.goTo}
                  onSetPosition={(zoneId, x, y) => updateSettings({ zoneId, position: { x, y } })}
                  onSelectMarker={selection.selectMarker}
                  onClearSelection={selection.clear}
                  layers={find.filters.layers}
                  onLayersChange={(layers) => find.update({ layers })}
                  searchMarkers={mapSearch.markers}
                />
              </div>
            )}
          </div>
          <ForeverNotes />
          <AddonHelp />
          {canImport && <CaptureImport data={data} />}
        </>
      )}
    </main>
  );
}
