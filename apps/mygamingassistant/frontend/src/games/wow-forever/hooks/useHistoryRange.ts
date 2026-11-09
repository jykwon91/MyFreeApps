import { useCallback, useMemo } from "react";
import { parseHistoryRange, writeHistoryRange } from "@/games/wow-forever/lib/serverStatus/historyRangeParam";
import type { HistoryRange } from "@/games/wow-forever/types/serverStatus/historyRange";
import { useLiveSearchParams } from "@platform/ui";

/** The timeline's span, kept in `?range=` (each change replaces history, so Back leaves the page). */
export function useHistoryRange(): [HistoryRange, (range: HistoryRange) => void] {
  const [params, setParams] = useLiveSearchParams();
  const range = useMemo(() => parseHistoryRange(params), [params]);
  const setRange = useCallback(
    (next: HistoryRange) => setParams((prev) => writeHistoryRange(prev, next), { replace: true }),
    [setParams],
  );
  return [range, setRange];
}
