import { useMemo, useState } from "react";
import { AlertBox } from "@platform/ui";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import AddonHelp from "@/games/wow-forever/components/worldMap/AddonHelp";
import FindServices from "@/games/wow-forever/components/worldMap/FindServices";
import ForeverNotes from "@/games/wow-forever/components/worldMap/ForeverNotes";
import InstanceList from "@/games/wow-forever/components/worldMap/InstanceList";
import QuestGivers from "@/games/wow-forever/components/worldMap/QuestGivers";
import MapPanel from "@/games/wow-forever/components/worldMap/MapPanel";
import NearestServices from "@/games/wow-forever/components/worldMap/NearestServices";
import PlayerStrip from "@/games/wow-forever/components/worldMap/PlayerStrip";
import WorldMapSkeleton from "@/games/wow-forever/components/worldMap/WorldMapSkeleton";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { LOAD_STATUS, useWorldMapData } from "@/games/wow-forever/hooks/useWorldMapData";
import { nextWarlockTraining } from "@/games/wow-forever/worldMap/training";
import { buildWorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

/** /wow-forever/map — where is the nearest trainer / flight master / bank, and how do I get there. */
export default function WowWorldMapPage() {
  const { status, data, retry } = useWorldMapData();
  const [settings, updateSettings] = usePlayerSettings();
  const [findFilterId, setFindFilterId] = useState<string>(SERVICE_KIND.classTrainer);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [includeOtherFaction, setIncludeOtherFaction] = useState(false);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);

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

  const toggle = (poiId: string) => setSelectedPoiId((current) => (current === poiId ? null : poiId));
  const training = nextWarlockTraining(settings.classId, settings.level);

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
          <PlayerStrip data={data} settings={settings} onChange={updateSettings} />
          {!model && (
            <AlertBox variant="info">Pick your zone above to see what's nearest to you.</AlertBox>
          )}
          {model && (
            <>
              {model.zone.foreverOnly && (
                <AlertBox variant="warning">
                  {model.zone.name} is new in Forever and not mapped yet — the results below are the nearest known places outside it.
                </AlertBox>
              )}
              {model.usingZoneCentre && (
                <p className="text-sm text-muted-foreground">
                  Measuring from the middle of {model.zone.name}. Click the map or enter your coordinates for better results.
                </p>
              )}
              {training && <p className="text-sm">{training}</p>}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-8">
                  <NearestServices
                    rows={model.hero}
                    data={data}
                    faction={settings.faction}
                    selectedPoiId={selectedPoiId}
                    onToggle={toggle}
                    directions={model.directions}
                  />
                  <FindServices
                    data={data}
                    faction={settings.faction}
                    classId={settings.classId}
                    filter={model.findFilter}
                    onFilterChange={setFindFilterId}
                    showAllClasses={showAllClasses}
                    onShowAllClassesChange={setShowAllClasses}
                    includeOtherFaction={includeOtherFaction}
                    onIncludeOtherFactionChange={setIncludeOtherFaction}
                    results={model.findResults}
                    selectedPoiId={selectedPoiId}
                    onToggle={toggle}
                    directions={model.directions}
                  />
                  <QuestGivers
                    data={data}
                    faction={settings.faction}
                    level={settings.level}
                    givers={model.questGivers}
                    selectedPoiId={selectedPoiId}
                    onToggle={toggle}
                    directions={model.directions}
                  />
                  <InstanceList
                    data={data}
                    faction={settings.faction}
                    level={settings.level}
                    instances={model.instances}
                    selectedPoiId={selectedPoiId}
                    onToggle={toggle}
                    directions={model.directions}
                  />
                </div>
                <div className="lg:sticky lg:top-4">
                  <MapPanel
                    data={data}
                    model={model}
                    onPick={(zoneId, x, y) => updateSettings({ zoneId, position: { x, y } })}
                    onSelect={toggle}
                  />
                </div>
              </div>
            </>
          )}
          <ForeverNotes />
          <AddonHelp />
        </>
      )}
    </main>
  );
}
