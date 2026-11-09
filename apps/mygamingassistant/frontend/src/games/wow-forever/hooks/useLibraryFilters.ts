import { useCallback, useMemo } from "react";
import {
  DEFAULT_LIBRARY_FILTERS,
  parseLibraryFilters,
  writeLibraryFilters,
} from "@/games/wow-forever/lib/library/libraryFilterParams";
import type { LibraryFilters } from "@/games/wow-forever/types/library/libraryFilters";
import { useLiveSearchParams } from "@platform/ui";

/** The book list's filters, read from and written to the URL (each change replaces history). */
export function useLibraryFilters(): {
  filters: LibraryFilters;
  update: (patch: Partial<LibraryFilters>) => void;
  reset: () => void;
} {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => parseLibraryFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<LibraryFilters>) =>
      setParams((prev) => writeLibraryFilters(prev, { ...parseLibraryFilters(prev), ...patch }), { replace: true }),
    [setParams],
  );
  const reset = useCallback(
    () => setParams((prev) => writeLibraryFilters(prev, DEFAULT_LIBRARY_FILTERS), { replace: true }),
    [setParams],
  );
  return { filters, update, reset };
}
