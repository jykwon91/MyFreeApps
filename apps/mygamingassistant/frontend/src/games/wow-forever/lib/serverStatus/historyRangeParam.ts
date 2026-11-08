import { DEFAULT_HISTORY_RANGE, HISTORY_RANGE_PARAM } from "@/games/wow-forever/data/serverStatus/historyRanges";
import type { HistoryRange } from "@/games/wow-forever/types/serverStatus/historyRange";

/** The span in the URL; anything we don't know reads as the default. */
export function parseHistoryRange(params: URLSearchParams): HistoryRange {
  return params.get(HISTORY_RANGE_PARAM) === "7d" ? "7d" : DEFAULT_HISTORY_RANGE;
}

/** The query with `range` set; the default span leaves the parameter out. */
export function writeHistoryRange(params: URLSearchParams, range: HistoryRange): URLSearchParams {
  const next = new URLSearchParams(params);
  if (range === DEFAULT_HISTORY_RANGE) next.delete(HISTORY_RANGE_PARAM);
  else next.set(HISTORY_RANGE_PARAM, range);
  return next;
}
