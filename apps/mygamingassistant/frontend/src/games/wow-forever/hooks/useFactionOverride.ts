import { useCallback } from "react";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** `?faction=H` — plan and search as this faction for this visit, without changing your saved one. */
export const FACTION_PARAM = "faction";

const PLAYER_FACTIONS: readonly PlayerFaction[] = [FACTION.alliance, FACTION.horde];

/** Only a real player faction counts; anything else falls back to the saved faction. */
export function parseFactionParam(raw: string | null): PlayerFaction | null {
  return PLAYER_FACTIONS.find((f) => f === raw) ?? null;
}

export interface FactionOverride {
  faction: PlayerFaction | null;
  /** Drop the override (you picked a faction yourself). */
  clear: () => void;
}

export function useFactionOverride(): FactionOverride {
  const [params, setParams] = useLiveSearchParams();
  const clear = useCallback(
    () =>
      setParams(
        (prev) => {
          prev.delete(FACTION_PARAM);
          return prev;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { faction: parseFactionParam(params.get(FACTION_PARAM)), clear };
}
