import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MAP_PARAM } from "@/games/wow-forever/hooks/useMapView";
import {
  ENDPOINT_KIND,
  formatEndpoint,
  MY_LOCATION,
  parseEndpoint,
  type Endpoint,
  type TripStart,
} from "@/games/wow-forever/worldMap/trip";

/** `?to=npc:5482` — where the trip goes. */
export const TO_PARAM = "to";
/** `?from=pt:1429,42.1,65.9` — where it starts; absent = your location. */
export const FROM_PARAM = "from";
/** `?dir=1` — the directions (From / To + steps) are open. */
export const DIR_PARAM = "dir";
/** `?npc=5482` — older links (Cooking & Fishing trainers): the same as `to=npc:5482`. */
export const NPC_PARAM = "npc";

export interface TripChange {
  to?: Endpoint | null;
  from?: TripStart;
  directions?: boolean;
  /** The map to show with it, in the same history entry. */
  mapId?: number;
}

export interface TripState {
  to: Endpoint | null;
  from: TripStart;
  directionsOpen: boolean;
  /** Change the trip: a new history entry, so browser Back undoes it — unless `replace`. */
  change: (patch: TripChange, options?: { replace?: boolean }) => void;
}

/** The trip lives in the URL, so every step of it can be linked and Back walks through them. */
export function useTrip(): TripState {
  const [params, setParams] = useSearchParams();
  const toText = params.get(TO_PARAM);
  const npcText = params.get(NPC_PARAM);
  const fromText = params.get(FROM_PARAM);
  const dirText = params.get(DIR_PARAM);

  const to = useMemo<Endpoint | null>(() => {
    const parsed = parseEndpoint(toText);
    if (parsed) return parsed;
    return npcText ? { kind: ENDPOINT_KIND.npc, poiId: npcText } : null;
  }, [toText, npcText]);
  const from = useMemo<TripStart>(() => parseEndpoint(fromText) ?? MY_LOCATION, [fromText]);

  const change = useCallback(
    (patch: TripChange, options: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.to !== undefined) {
            next.delete(NPC_PARAM);
            if (patch.to) next.set(TO_PARAM, formatEndpoint(patch.to));
            else next.delete(TO_PARAM);
          }
          if (patch.from !== undefined) {
            if (patch.from === MY_LOCATION) next.delete(FROM_PARAM);
            else next.set(FROM_PARAM, formatEndpoint(patch.from));
          }
          if (patch.directions !== undefined) {
            if (patch.directions) next.set(DIR_PARAM, "1");
            else next.delete(DIR_PARAM);
          }
          if (!next.has(TO_PARAM) && !next.has(NPC_PARAM)) {
            next.delete(FROM_PARAM);
            next.delete(DIR_PARAM);
          }
          if (patch.mapId !== undefined) next.set(MAP_PARAM, String(patch.mapId));
          return next;
        },
        { replace: options.replace },
      );
    },
    [setParams],
  );

  return { to, from, directionsOpen: dirText === "1" && to !== null, change };
}
