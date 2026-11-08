import { useCallback, useMemo } from "react";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { parseBeastFilters, writeBeastFilters } from "@/games/wow-forever/lib/hunterPets/beastFilterParams";
import type { BeastFilters } from "@/games/wow-forever/types/hunterPets/beastFilters";

/** The Hunter pets page's family, search and sort, read from and written to the URL (each change replaces history). */
export function useBeastFilters(): { filters: BeastFilters; update: (patch: Partial<BeastFilters>) => void } {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => parseBeastFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<BeastFilters>) =>
      setParams((prev) => writeBeastFilters({ ...parseBeastFilters(prev), ...patch }, prev), { replace: true }),
    [setParams],
  );
  return { filters, update };
}
