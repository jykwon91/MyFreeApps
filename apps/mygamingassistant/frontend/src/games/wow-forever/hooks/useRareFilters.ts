import { useCallback, useMemo } from "react";
import { DEFAULT_RARE_FILTERS, parseRareFilters, writeRareFilters } from "@/games/wow-forever/lib/rares/rareFilterParams";
import type { RareFilters } from "@/games/wow-forever/types/rares/rareFilters";
import { useLiveSearchParams } from "@platform/ui";

/** The rares list's filters, read from and written to the URL (each change replaces history). */
export function useRareFilters(): {
  filters: RareFilters;
  update: (patch: Partial<RareFilters>) => void;
  reset: () => void;
} {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => parseRareFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<RareFilters>) =>
      setParams((prev) => writeRareFilters(prev, { ...parseRareFilters(prev), ...patch }), { replace: true }),
    [setParams],
  );
  const reset = useCallback(
    () => setParams((prev) => writeRareFilters(prev, DEFAULT_RARE_FILTERS), { replace: true }),
    [setParams],
  );
  return { filters, update, reset };
}
