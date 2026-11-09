import { useCallback, useMemo } from "react";
import { DEFAULT_RACE_FILTERS, parseRaceFilters, writeRaceFilters } from "@/games/wow-forever/lib/races/raceFilterParams";
import type { RaceFilters } from "@/games/wow-forever/types/races/raceFilters";
import { useLiveSearchParams } from "@platform/ui";

/** The races page's filters, read from and written to the URL (each change replaces history). */
export function useRaceFilters(): {
  filters: RaceFilters;
  update: (patch: Partial<RaceFilters>) => void;
  reset: () => void;
} {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => parseRaceFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<RaceFilters>) =>
      setParams((prev) => writeRaceFilters(prev, { ...parseRaceFilters(prev), ...patch }), { replace: true }),
    [setParams],
  );
  const reset = useCallback(
    () => setParams((prev) => writeRaceFilters(prev, DEFAULT_RACE_FILTERS), { replace: true }),
    [setParams],
  );
  return { filters, update, reset };
}
