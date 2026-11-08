import type { HistoryRange } from "@/games/wow-forever/types/serverStatus/historyRange";

/** The query parameter holding the timeline's span (`?range=7d`; no parameter = the last day). */
export const HISTORY_RANGE_PARAM = "range";

export const DEFAULT_HISTORY_RANGE: HistoryRange = "24h";

/** The span picker's choices, shortest first. */
export const HISTORY_RANGE_OPTIONS: readonly { id: HistoryRange; label: string }[] = [
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
];

const HOUR_MS = 3_600_000;

/** How far back each span reaches. */
export const HISTORY_RANGE_MS: Readonly<Record<HistoryRange, number>> = {
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
};

/** Outages listed under the timelines: the whole week the server keeps for the page. */
export const OUTAGE_LIST_RANGE: HistoryRange = "7d";

/** How many outages the list shows before "Show all". */
export const OUTAGE_LIST_LIMIT = 10;
