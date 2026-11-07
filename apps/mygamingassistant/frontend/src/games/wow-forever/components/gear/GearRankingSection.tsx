import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import GearResults from "@/games/wow-forever/components/gear/GearResults";
import GearSlotsSkeleton from "@/games/wow-forever/components/gear/GearSlotsSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import SettledStatus from "@/games/wow-forever/components/shared/SettledStatus";
import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_VIEW } from "@/games/wow-forever/data/gear/gearViews";
import { gearHeading } from "@/games/wow-forever/gear/gearHeading";
import { rankLeveling, rankPreRaid } from "@/games/wow-forever/gear/rankGear";
import type { GearDataState } from "@/games/wow-forever/types/gearDataState";
import type { GearRanking } from "@/games/wow-forever/types/gearRanking";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";

interface GearRankingSectionProps {
  settings: GearSettings;
  state: GearDataState;
}

/** The "While leveling" / "Level 60 (pre-raid)" tables: top items per slot for the settings. */
export default function GearRankingSection({ settings, state }: GearRankingSectionProps) {
  const leveling = settings.view === GEAR_VIEW.leveling;
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
    <>
      <SettledStatus message={status} />
      {state.status === "error" ? (
        <LoadErrorRetry message="Couldn't load the item list. Check your connection and try again." onRetry={state.retry} retrying={state.retrying} />
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
    </>
  );
}
