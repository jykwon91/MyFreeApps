import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import GearPhaseBanner from "@/games/wow-forever/components/gear/GearPhaseBanner";
import GearResults from "@/games/wow-forever/components/gear/GearResults";
import GearSettingsBar from "@/games/wow-forever/components/gear/GearSettingsBar";
import GearSlotsSkeleton from "@/games/wow-forever/components/gear/GearSlotsSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import SettledStatus from "@/games/wow-forever/components/shared/SettledStatus";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_VIEWS } from "@/games/wow-forever/data/gear/gearViews";
import { gearHeading } from "@/games/wow-forever/gear/gearHeading";
import { rankLeveling, rankPreRaid } from "@/games/wow-forever/gear/rankGear";
import { useGearData } from "@/games/wow-forever/hooks/useGearData";
import { useGearSettings } from "@/games/wow-forever/hooks/useGearSettings";
import type { GearRanking } from "@/games/wow-forever/types/gearRanking";

/** /wow-forever/gear — the top items per slot for your class, spec and level: leveling upgrades, then pre-raid at 60. */
export default function WowGearPage() {
  const [settings, update] = useGearSettings();
  const state = useGearData();
  const leveling = settings.view === "leveling";
  const level = leveling ? settings.level : PRE_RAID_LEVEL;

  const ranking = useMemo<GearRanking | null>(() => {
    if (state.status !== "ready" || level === null) return null;
    const items = state.list.items;
    return leveling ? rankLeveling(items, state.gear, settings, level) : rankPreRaid(items, state.gear, settings);
  }, [state, settings, leveling, level]);

  let status = "Loading the item list.";
  if (state.status === "error") status = "Couldn't load the item list.";
  else if (level === null) status = "Enter your level to see gear you can wear now.";
  else if (ranking) status = gearHeading(settings, level, leveling);

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <WowPageHeader
        title="Best gear"
        subtitle="The top items per slot for your class, spec and level — the next upgrades while leveling, then a pre-raid list for level 60."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <GearPhaseBanner />
      <GearSettingsBar settings={settings} onChange={update} />
      <SegmentedToggle
        label="Which list"
        options={GEAR_VIEWS}
        value={settings.view}
        onChange={(view) => update({ view })}
        className="flex-wrap"
      />
      <SettledStatus message={status} />

      {state.status === "error" ? (
        <LoadErrorRetry
          message="Couldn't load the item list. Check your connection and try again."
          onRetry={state.retry}
          retrying={state.retrying}
        />
      ) : null}
      {state.status === "loading" ? <GearSlotsSkeleton classId={settings.classId} /> : null}
      {state.status === "ready" && level === null ? (
        <EmptyStateNote message="Enter your level to see the best gear you can wear now, and the next upgrade for each slot." />
      ) : null}
      {ranking && level !== null ? (
        <GearResults
          ranking={ranking}
          heading={gearHeading(settings, level, leveling)}
          leveling={leveling}
          clientBuild={state.status === "ready" ? state.gear.clientBuild : ""}
        />
      ) : null}
    </main>
  );
}
