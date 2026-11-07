import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { findClass } from "@/games/wow-forever/data/classes";
import {
  ALL_MACRO_CLASSES,
  MACRO_CLASS_PARAM,
  MACRO_CLASS_STORAGE_KEY,
} from "@/games/wow-forever/data/macros/macroClassFilter";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { MacroClassFilter } from "@/games/wow-forever/types/macros/macroClassFilter";

/** A valid filter from a URL or stored value, else null. */
export function parseMacroClassFilter(raw: unknown): MacroClassFilter | null {
  if (raw === ALL_MACRO_CLASSES) return ALL_MACRO_CLASSES;
  return typeof raw === "string" ? (findClass(raw)?.id ?? null) : null;
}

/**
 * The Macros page's class picker. `?class=` wins (a link shares the exact
 * list, and the old Warlock page redirects with `?class=warlock`); otherwise
 * the last class picked here; otherwise every class. A change replaces the URL
 * and is remembered for the next visit.
 */
export function useMacroClassFilter(): [MacroClassFilter, (next: MacroClassFilter) => void] {
  const [params, setParams] = useSearchParams();
  // In state, not just storage: picking "All classes" when the class came from storage leaves the URL as it was.
  const [remembered, setRemembered] = useState<MacroClassFilter>(() =>
    readStored(MACRO_CLASS_STORAGE_KEY, parseMacroClassFilter, ALL_MACRO_CLASSES),
  );
  const filter = parseMacroClassFilter(params.get(MACRO_CLASS_PARAM)) ?? remembered;

  const update = useCallback(
    (next: MacroClassFilter) => {
      writeStored(MACRO_CLASS_STORAGE_KEY, next);
      setRemembered(next);
      setParams(next === ALL_MACRO_CLASSES ? {} : { [MACRO_CLASS_PARAM]: next }, { replace: true });
    },
    [setParams],
  );

  return [filter, update];
}
