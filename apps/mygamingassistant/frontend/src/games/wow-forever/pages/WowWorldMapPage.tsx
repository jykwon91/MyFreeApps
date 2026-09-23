import { useMemo, useState } from "react";
import { AlertBox, useIsAuthenticated } from "@platform/ui";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import AddonHelp from "@/games/wow-forever/components/worldMap/AddonHelp";
import CaptureImport from "@/games/wow-forever/components/worldMap/CaptureImport";
import FindServices from "@/games/wow-forever/components/worldMap/FindServices";
import ForeverNotes from "@/games/wow-forever/components/worldMap/ForeverNotes";
import InstanceList from "@/games/wow-forever/components/worldMap/InstanceList";
import QuestGivers from "@/games/wow-forever/components/worldMap/QuestGivers";
import NearestServices from "@/games/wow-forever/components/worldMap/NearestServices";
import PlayerStrip from "@/games/wow-forever/components/worldMap/PlayerStrip";
import WorldMapPanel from "@/games/wow-forever/components/worldMap/WorldMapPanel";
import WorldMapSkeleton from "@/games/wow-forever/components/worldMap/WorldMapSkeleton";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { useMapSelection } from "@/games/wow-forever/hooks/useMapSelection";
import { useMapView } from "@/games/wow-forever/hooks/useMapView";
import { usePlayerSettings, type PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useWorldMap } from "@/games/wow-forever/hooks/useWorldMap";
import { LOAD_STATUS } from "@/games/wow-forever/hooks/useWorldMapData";
import { isServeOnly } from "@/lib/serveOnly";
import { nextWarlockTraining } from "@/games/wow-forever/worldMap/training";
import { buildWorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

/** /wow-forever/map — where is the nearest trainer / flight master / bank, and how do I get there. */
export default function WowWorldMapPage() {
  const { status, data, retry, capturesFailed } = useWorldMap();
  const canImport = useIsAuthenticated() && !isServeOnly();
  const [settings, updateSettings] = usePlayerSettings();
  const [findFilterId, setFindFilterId] = useState<string>(SERVICE_KIND.classTrainer);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [includeOtherFaction, setIncludeOtherFaction] = useState(false);
  const view = useMapView(data, settings.zoneId);
  const selection = useMapSelection(data, view.goTo);
  const { selectedPoiId } = selection;

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

  /** The strip changing your zone brings the map back to it; browsing the map never changes your zone. */
  function changeSettings(patch: Partial<PlayerSettings>) {
    updateSettings(patch);
    if (patch.zoneId !== undefined && patch.zoneId !== settings.zoneId) view.followPlayer();
  }

  const training = nextWarlockTraining(settings.classId, settings.level);
  const rowProps = {
    data,
    faction: settings.faction,
    selectedPoiId,
    onToggle: selection.toggle,
    onSelect: selection.select,
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
          <PlayerStrip data={data} settings={settings} onChange={changeSettings} />
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
              {!model && (
                <AlertBox variant="info">
                  Pick your zone above — or open it on the map and click where you are — to see what's nearest to you.
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
                    onFilterChange={setFindFilterId}
                    showAllClasses={showAllClasses}
                    onShowAllClassesChange={setShowAllClasses}
                    includeOtherFaction={includeOtherFaction}
                    onIncludeOtherFactionChange={setIncludeOtherFaction}
                    results={model.findResults}
                  />
                  <QuestGivers {...rowProps} data={data} level={settings.level} givers={model.questGivers} />
                  <InstanceList {...rowProps} data={data} level={settings.level} instances={model.instances} />
                </>
              )}
            </div>
            {view.mapId !== null && (
              <div className="lg:sticky lg:top-4">
                <WorldMapPanel
                  data={data}
                  model={model}
                  faction={settings.faction}
                  mapId={view.mapId}
                  playerZoneId={settings.zoneId}
                  focus={selection.focus}
                  onFocusApplied={selection.clearFocus}
                  onOpen={view.goTo}
                  onSetPosition={(zoneId, x, y) => updateSettings({ zoneId, position: { x, y } })}
                  onSelectMarker={selection.selectMarker}
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
