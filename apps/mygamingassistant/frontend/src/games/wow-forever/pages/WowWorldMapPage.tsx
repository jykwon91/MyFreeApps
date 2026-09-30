import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertBox, useIsAuthenticated } from "@platform/ui";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import AddonHelp from "@/games/wow-forever/components/worldMap/AddonHelp";
import CaptureImport from "@/games/wow-forever/components/worldMap/CaptureImport";
import GoingToCard from "@/games/wow-forever/components/worldMap/GoingToCard";
import MapSearch from "@/games/wow-forever/components/worldMap/MapSearch";
import FindServices from "@/games/wow-forever/components/worldMap/FindServices";
import ForeverNotes from "@/games/wow-forever/components/worldMap/ForeverNotes";
import InstanceList from "@/games/wow-forever/components/worldMap/InstanceList";
import QuestGivers from "@/games/wow-forever/components/worldMap/QuestGivers";
import NearestServices from "@/games/wow-forever/components/worldMap/NearestServices";
import PlayerStrip from "@/games/wow-forever/components/worldMap/PlayerStrip";
import WorldMapPanel from "@/games/wow-forever/components/worldMap/WorldMapPanel";
import WorldMapSkeleton from "@/games/wow-forever/components/worldMap/WorldMapSkeleton";
import { useFindFilters } from "@/games/wow-forever/hooks/useFindFilters";
import { useMapSelection } from "@/games/wow-forever/hooks/useMapSelection";
import { useMapView } from "@/games/wow-forever/hooks/useMapView";
import { usePlayerSettings, type PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useWorldMap } from "@/games/wow-forever/hooks/useWorldMap";
import { LOAD_STATUS } from "@/games/wow-forever/hooks/useWorldMapData";
import { isServeOnly } from "@/lib/serveOnly";
import { revealInViewport } from "@/games/wow-forever/lib/revealInViewport";
import { buildPlaces, type Place } from "@/games/wow-forever/worldMap/places";
import { findLinkedPoi } from "@/games/wow-forever/worldMap/search";
import { nextWarlockTraining } from "@/games/wow-forever/worldMap/training";
import { buildWorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

/** `/wow-forever/map?npc=5482` — open the map on that NPC (a creature id, or a map result id). */
export const NPC_PARAM = "npc";

const MAP_PANEL_ID = "wm-map-panel";

/** /wow-forever/map — where is the nearest trainer / flight master / bank, and how do I get there. */
export default function WowWorldMapPage() {
  const { status, data, retry, capturesFailed } = useWorldMap();
  const canImport = useIsAuthenticated() && !isServeOnly();
  const [settings, updateSettings] = usePlayerSettings();
  const find = useFindFilters();
  const { findFilterId, showAllClasses, includeOtherFaction } = find.filters;
  const view = useMapView(data, settings.zoneId);
  const selection = useMapSelection(data, view);
  const { selectedPoiId } = selection;
  const places = useMemo(() => (data ? buildPlaces(data) : []), [data]);
  /** A result picked in the search box (or linked): shown pinned above the lists while it's selected. */
  const [pinnedPoiId, setPinnedPoiId] = useState<string | null>(null);
  const goingToRef = useRef<HTMLElement>(null);
  const [params] = useSearchParams();
  const linkedNpc = params.get(NPC_PARAM);
  const linkedPoi = useMemo(() => (data && linkedNpc ? findLinkedPoi(linkedNpc, data) : undefined), [data, linkedNpc]);
  const linkMissing = Boolean(data && linkedNpc && !linkedPoi);
  const linkHandled = useRef<string | null>(null);
  const { select } = selection;

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

  function pickNpc(poiId: string) {
    setPinnedPoiId(poiId);
    selection.select(poiId, { revealMap: false });
    // Stacked layout: the card with the directions is what to see first; "Show on map" is on it.
    window.requestAnimationFrame(() => revealInViewport(goingToRef.current));
  }

  function pickPlace(place: Place) {
    selection.clear();
    view.goTo(place.zoneId);
    revealInViewport(document.getElementById(MAP_PANEL_ID));
  }

  // A `?npc=` link selects its NPC once per value; after that the page is the player's.
  useEffect(() => {
    if (!linkedPoi || !linkedNpc || linkHandled.current === linkedNpc) return;
    linkHandled.current = linkedNpc;
    select(linkedPoi.id, { revealMap: false });
  }, [linkedPoi, linkedNpc, select]);
  const showGoingTo = selectedPoiId !== null && (selectedPoiId === pinnedPoiId || selectedPoiId === linkedPoi?.id);

  const searchContext = useMemo(
    () => ({ faction: settings.faction, player: model?.player ?? null }),
    [settings.faction, model?.player],
  );

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
    directions: model?.directions,
  };

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
          <MapSearch data={data} places={places} context={searchContext} onPickNpc={pickNpc} onPickPlace={pickPlace} />
          {linkMissing && (
            <AlertBox variant="info">That link's NPC isn't on the map. Search for them by name above.</AlertBox>
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
              {showGoingTo && selectedPoiId !== null && (
                <GoingToCard
                  ref={goingToRef}
                  data={data}
                  faction={settings.faction}
                  poiId={selectedPoiId}
                  model={model}
                  onClear={selection.clear}
                  onShowMap={() => document.getElementById(MAP_PANEL_ID)?.scrollIntoView({ block: "start" })}
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
