import { useMemo } from "react";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { GEAR_VIEW } from "@/games/wow-forever/data/gear/gearViews";
import { useGearData } from "@/games/wow-forever/hooks/useGearData";
import { computeBisPicks } from "@/games/wow-forever/lib/auctionHouse/bisPicks";
import type { AuctionBisState } from "@/games/wow-forever/types/auctionHouse/auctionBisState";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/**
 * The top three items per slot for the player's class, spec and `level`, worked
 * out once the item list and gear data have loaded. With `enabled` false nothing is
 * requested or worked out; otherwise only recomputed when the class, spec, faction or level change.
 */
export function useAuctionBisPicks(enabled: boolean, classId: WowClassId, specId: string, faction: PlayerFaction, level: number): AuctionBisState {
  const data = useGearData(enabled);
  return useMemo<AuctionBisState>(() => {
    if (!enabled) return { status: LOAD_STATUS.loading };
    if (data.status === LOAD_STATUS.ready) {
      const settings: GearSettings = { classId, specId, level, faction, view: GEAR_VIEW.preraid, includePvp: false };
      return { status: LOAD_STATUS.ready, picks: computeBisPicks(data.list.items, data.gear, settings, level) };
    }
    if (data.status === LOAD_STATUS.error) return { status: LOAD_STATUS.error, retry: data.retry, retrying: data.retrying };
    return { status: LOAD_STATUS.loading };
  }, [enabled, data, classId, specId, faction, level]);
}
