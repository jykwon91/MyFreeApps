import { useCallback, useMemo, useState } from "react";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { FLIGHT_MODE, type FlightMode, type TravelOptions } from "@/games/wow-forever/worldMap/directions";

export const TRAVEL_SETTINGS_STORAGE_KEY = "mga.wowForever.worldMap.travel.v1";

/** How the player can travel. Remembered between visits. */
export interface TravelSettings {
  flights: FlightMode;
  /** Flight master ids ticked under "Only ones I know". */
  knownFlightIds: number[];
}

export const DEFAULT_TRAVEL_SETTINGS: TravelSettings = { flights: FLIGHT_MODE.all, knownFlightIds: [] };

/** Accept a stored value only if it still makes sense. */
export function parseTravelSettings(raw: unknown): TravelSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const flights = Object.values(FLIGHT_MODE).find((m) => m === r.flights);
  if (!flights) return null;
  const ids = Array.isArray(r.knownFlightIds) ? r.knownFlightIds : [];
  const knownFlightIds = [...new Set(ids.filter((id): id is number => Number.isInteger(id)))];
  return { flights, knownFlightIds };
}

export interface TravelSettingsState {
  settings: TravelSettings;
  /** The planner's view of the settings. */
  options: TravelOptions;
  setFlights: (flights: FlightMode) => void;
  /** Tick (true) or untick (false) flight masters. */
  setKnown: (ids: readonly number[], known: boolean) => void;
}

export function useTravelSettings(): TravelSettingsState {
  const [settings, setSettings] = useState<TravelSettings>(() =>
    readStored(TRAVEL_SETTINGS_STORAGE_KEY, parseTravelSettings, DEFAULT_TRAVEL_SETTINGS),
  );

  const save = useCallback((change: (prev: TravelSettings) => TravelSettings) => {
    setSettings((prev) => {
      const next = change(prev);
      writeStored(TRAVEL_SETTINGS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setFlights = useCallback((flights: FlightMode) => save((prev) => ({ ...prev, flights })), [save]);

  const setKnown = useCallback(
    (ids: readonly number[], known: boolean) =>
      save((prev) => {
        const next = new Set(prev.knownFlightIds);
        for (const id of ids) {
          if (known) next.add(id);
          else next.delete(id);
        }
        return { ...prev, knownFlightIds: [...next] };
      }),
    [save],
  );

  const options = useMemo<TravelOptions>(
    () => ({ flights: settings.flights, knownFlightIds: new Set(settings.knownFlightIds) }),
    [settings],
  );

  return { settings, options, setFlights, setKnown };
}
