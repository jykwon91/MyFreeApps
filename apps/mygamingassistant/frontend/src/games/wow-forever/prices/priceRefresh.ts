import { BLIZZARD_SNAPSHOT_INTERVAL_MS } from "@/games/wow-forever/data/priceRefreshConfig";
import { cooldownMinutes } from "@/games/wow-forever/lib/refreshCooldown";
import type { PriceRefreshBaseline } from "@/games/wow-forever/types/priceRefreshBaseline";
import type { PriceRefreshOutcome } from "@/games/wow-forever/types/priceRefreshOutcome";
import type { PriceRefreshState } from "@/games/wow-forever/types/priceRefreshState";

export function refreshBaselineOf(state: PriceRefreshState): PriceRefreshBaseline {
  return { sourceUpdatedAt: state.source_updated_at, fetchedAt: state.fetched_at, failedAt: state.refresh_failed_at };
}

/**
 * How a refresh asked for at `baseline` has gone. A finished download always moves `fetched_at`; only a
 * newer Blizzard snapshot moves `source_updated_at`, so a download that leaves it alone found nothing new.
 */
export function refreshOutcome(baseline: PriceRefreshBaseline, state: PriceRefreshState): PriceRefreshOutcome {
  if (state.fetched_at !== baseline.fetchedAt) {
    return state.source_updated_at !== baseline.sourceUpdatedAt ? "updated" : "unchanged";
  }
  return state.refresh_failed_at !== baseline.failedAt ? "failed" : "pending";
}

/**
 * Minutes until Blizzard should have a newer snapshot: an hour after the last one, never less than the
 * server's own cooldown (the page can't ask again sooner) — a late snapshot reads as that wait too.
 */
export function minutesToNextSnapshot(sourceUpdatedAt: string | null, nowMs: number, cooldownLeftMs: number): number {
  const untilSnapshot = sourceUpdatedAt === null ? 0 : Date.parse(sourceUpdatedAt) + BLIZZARD_SNAPSHOT_INTERVAL_MS - nowMs;
  return cooldownMinutes(Math.max(untilSnapshot, cooldownLeftMs));
}
