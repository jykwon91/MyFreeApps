import { useCallback, useMemo } from "react";
import { parseChangeFilters, writeChangeFilters } from "@/games/wow-forever/lib/changes/changeFilterParams";
import type { ChangeFilters } from "@/games/wow-forever/types/changes/changeFilters";
import { useLiveSearchParams } from "@platform/ui";

/** The page's filters, read from and written to the URL (each change replaces history). */
export function useChangeFilters(): [ChangeFilters, (patch: Partial<ChangeFilters>) => void] {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => parseChangeFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<ChangeFilters>) =>
      setParams((prev) => writeChangeFilters(prev, { ...parseChangeFilters(prev), ...patch }), { replace: true }),
    [setParams],
  );
  return [filters, update];
}
