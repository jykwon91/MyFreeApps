import { COVERAGE_MESSAGES } from "../constants/discoverMessages";

/**
 * "Scored 12 of 80 — the rest await the next daily scoring pass", or null when there is nothing to
 * count. The scorer only rates the daily top-N, so this makes a long unscored tail read as expected.
 */
export function inboxCoverageLine(scored: number | null, total: number | null): string | null {
  if (scored === null || total === null || total <= 0) return null;
  return COVERAGE_MESSAGES.scored(scored, total) + (total - scored > 0 ? COVERAGE_MESSAGES.restAwait : "");
}
