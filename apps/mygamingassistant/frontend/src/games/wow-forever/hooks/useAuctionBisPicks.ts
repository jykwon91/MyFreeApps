import { useMemo } from "react";
import { firstSpec, findSpec, type WowClassId } from "@/games/wow-forever/data/classes";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { GEAR_VIEW } from "@/games/wow-forever/data/gear/gearViews";
import { GEAR_SETTINGS_STORAGE_KEY, DEFAULT_GEAR_SETTINGS, parseGearSettings } from "@/games/wow-forever/hooks/useGearSettings";
import { useGearData } from "@/games/wow-forever/hooks/useGearData";
import { computeBisPicks } from "@/games/wow-forever/lib/auctionHouse/bisPicks";
import { readStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { AuctionBisState } from "@/games/wow-forever/types/auctionHouse/auctionBisState";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The spec the player last picked on the Best gear page, when it is for this class; else the class's first. */
function specFor(classId: WowClassId): string {
  const stored = readStored<GearSettings | null>(
    GEAR_SETTINGS_STORAGE_KEY,
    (raw) => (typeof raw === "object" && raw !== null ? parseGearSettings(raw as Record<string, unknown>, DEFAULT_GEAR_SETTINGS) : null),
    null,
  );
  return stored && stored.classId === classId && findSpec(classId, stored.specId) ? stored.specId : firstSpec(classId);
}

/**
 * The top three items per slot for the player's class, spec and `level`, worked
 * out once the item list and gear data have loaded (nothing is requested while
 * `enabled` is false). Only recomputed when the class, spec, faction or level change.
 */
export function useAuctionBisPicks(enabled: boolean, classId: WowClassId, faction: PlayerFaction, level: number): AuctionBisState {
  const data = useGearData(enabled);
  const specId = specFor(classId);
  return useMemo<AuctionBisState>(() => {
    if (data.status === LOAD_STATUS.ready) {
      const settings: GearSettings = { classId, specId, level, faction, view: GEAR_VIEW.preraid, includePvp: false };
      return { status: LOAD_STATUS.ready, picks: computeBisPicks(data.list.items, data.gear, settings, level) };
    }
    if (data.status === LOAD_STATUS.error) return { status: LOAD_STATUS.error, retry: data.retry, retrying: data.retrying };
    return { status: LOAD_STATUS.loading };
  }, [data, classId, specId, faction, level]);
}
