import { formatCount } from "@platform/core/utils/count";

/** The line above a finished search's results, which names the dish between its two halves: "3 versions of", then ", best first.". */
export const DISCOVERY_RESULTS_SUMMARY = {
  lead: (count: number) => `${formatCount(count, "version")} of`,
  tail: ", best first.",
} as const;
