import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { TRIAGE_SHEET_HISTORY_STATE } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import {
  parseOpenSheet,
  parseTriageFilters,
  parseTriageTab,
  withSheet,
  withTriageFilters,
  withTriageTab,
  withoutSheet,
} from "@/games/wow-forever/lib/featureRequests/triage/triageParams";
import type { TriageListFilters } from "@/games/wow-forever/types/featureRequests/triage/triageListFilters";
import type { TriageOpenSheet } from "@/games/wow-forever/types/featureRequests/triage/triageOpenSheet";
import type { TriageTab } from "@/games/wow-forever/types/featureRequests/triage/triageTab";

function pushedBySheet(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as Record<string, unknown>)[TRIAGE_SHEET_HISTORY_STATE] === true;
}

/**
 * The triage URL. Tabs push a history entry; filters replace it; a sheet pushes one (so Android Back
 * closes it) and closing a sheet goes Back to that entry rather than stacking another.
 */
export function useTriageParams() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = useMemo(() => parseTriageTab(params), [params]);
  const filters = useMemo(() => parseTriageFilters(params), [params]);
  const sheet = useMemo(() => parseOpenSheet(params), [params]);

  const setTab = useCallback((next: TriageTab) => setParams((prev) => withTriageTab(prev, next)), [setParams]);
  const setFilters = useCallback(
    (patch: Partial<TriageListFilters>) => setParams((prev) => withTriageFilters(prev, patch), { replace: true }),
    [setParams],
  );
  const openSheet = useCallback(
    (next: TriageOpenSheet) =>
      setParams((prev) => withSheet(prev, next), { state: { [TRIAGE_SHEET_HISTORY_STATE]: true } }),
    [setParams],
  );
  const closeSheet = useCallback(() => {
    if (pushedBySheet(location.state)) navigate(-1);
    else setParams((prev) => withoutSheet(prev), { replace: true });
  }, [location.state, navigate, setParams]);

  return { tab, filters, sheet, setTab, setFilters, openSheet, closeSheet };
}
