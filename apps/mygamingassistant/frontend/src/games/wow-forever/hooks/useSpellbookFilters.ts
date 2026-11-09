import { useCallback, useMemo } from "react";
import {
  DEFAULT_SPELLBOOK_FILTERS,
  parseSpellbookFilters,
  writeSpellbookFilters,
} from "@/games/wow-forever/lib/spellbook/spellbookFilterParams";
import type { SpellbookFilters } from "@/games/wow-forever/types/spellbook/spellbookFilters";
import { useLiveSearchParams } from "@platform/ui";

/** The spellbook's filters, read from and written to the URL (each change replaces history). */
export function useSpellbookFilters(): {
  filters: SpellbookFilters;
  update: (patch: Partial<SpellbookFilters>) => void;
  reset: () => void;
} {
  const [params, setParams] = useLiveSearchParams();
  const filters = useMemo(() => parseSpellbookFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<SpellbookFilters>) =>
      setParams((prev) => writeSpellbookFilters(prev, { ...parseSpellbookFilters(prev), ...patch }), { replace: true }),
    [setParams],
  );
  const reset = useCallback(
    () => setParams((prev) => writeSpellbookFilters(prev, DEFAULT_SPELLBOOK_FILTERS), { replace: true }),
    [setParams],
  );
  return { filters, update, reset };
}
