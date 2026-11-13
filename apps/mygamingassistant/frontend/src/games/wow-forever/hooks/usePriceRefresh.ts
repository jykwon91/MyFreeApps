import { useCallback, useEffect, useRef, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import {
  useFinishPriceRefreshMutation,
  useGetWowPriceRefreshStateQuery,
  useLoadFreshWowPricesMutation,
  useRefreshWowPricesMutation,
} from "@/games/wow-forever/api/wowPricesApi";
import {
  PRICE_REFRESH_COPY,
  PRICE_REFRESH_POLL_MS,
  PRICE_REFRESH_WATCH_TIMEOUT_MS,
  priceRefreshUnchangedCopy,
} from "@/games/wow-forever/data/priceRefreshConfig";
import { useRefreshCooldown } from "@/games/wow-forever/hooks/useRefreshCooldown";
import { useRefreshWatch } from "@/games/wow-forever/hooks/useRefreshWatch";
import { minutesToNextSnapshot, refreshBaselineOf, refreshOutcome } from "@/games/wow-forever/prices/priceRefresh";
import { statusOf } from "@/games/wow-forever/lib/raidPageError";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceRefreshBaseline } from "@/games/wow-forever/types/priceRefreshBaseline";

const TOO_MANY_REQUESTS = 429;
const SERVICE_UNAVAILABLE = 503;

export interface PriceRefresh {
  /** The house's refresh state has loaded, so the button knows its cooldown. */
  isReady: boolean;
  /** The refresh state couldn't be read, so there is no button to offer. */
  loadFailed: boolean;
  /** The refresh was asked for and the page is waiting for it to finish. */
  isRefreshing: boolean;
  /** Milliseconds until "Refresh now" works again; 0 when it does. */
  cooldownLeft: number;
  /**
   * A plain, not-a-fault note until the next click: Blizzard had no newer prices ("try again in ~N min"),
   * or a scheduled refresh is already running.
   */
  notice: string | null;
  refresh: () => Promise<void>;
}

interface WatchedRefresh {
  house: PriceHouse;
  baseline: PriceRefreshBaseline;
}

/**
 * "Refresh now" on the Auction house page. A click shows loading at once, reads the house's state
 * afresh (the page's copy may predate a scheduled run) to know what "finished" means, then asks the
 * server to pull this house from Blizzard (it answers at once and works in the background). The page
 * re-reads the state until the download time or failure time moves, and says how it went: new prices
 * (loaded past the browser cache into the shared price cache), nothing newer from Blizzard, or
 * Blizzard didn't answer. The cooldown comes from the server (`refresh_available_at`).
 *
 * It watches one house: key the caller by house so another house starts clean. If the page walks away
 * mid-refresh, the refresh is still followed to its end so that house's prices don't stay stale.
 */
export function usePriceRefresh(house: PriceHouse): PriceRefresh {
  const { currentData: state, isError, refetch } = useGetWowPriceRefreshStateQuery(house);
  const [start] = useRefreshWowPricesMutation();
  const [loadFresh] = useLoadFreshWowPricesMutation();
  const [finishInBackground] = useFinishPriceRefreshMutation();
  const [starting, setStarting] = useState(false);
  const [watching, setWatching] = useState<PriceRefreshBaseline | null>(null);
  const [runningNotice, setRunningNotice] = useState<string | null>(null);
  const { cooldownLeft, nowMs, syncClock, startCooldown } = useRefreshCooldown(state?.refresh_available_at ?? null);

  const outcome = watching !== null && state ? refreshOutcome(watching, state) : "pending";
  const isRefreshing = starting || (watching !== null && outcome === "pending");
  const unchangedNotice =
    outcome === "unchanged" && state
      ? priceRefreshUnchangedCopy(minutesToNextSnapshot(state.source_updated_at, nowMs, cooldownLeft))
      : null;
  const notice = runningNotice ?? unchangedNotice;

  // A refresh the server was asked for, until the page has seen it end. Walking away from it (another
  // house, another page) follows it to its end anyway.
  const inFlight = useRef<WatchedRefresh | null>(null);
  useRefreshWatch(watching !== null && outcome === "pending", refetch, {
    pollMs: PRICE_REFRESH_POLL_MS,
    timeoutMs: PRICE_REFRESH_WATCH_TIMEOUT_MS,
    onPoll: syncClock,
    onGiveUp: () => {
      setWatching(null);
      inFlight.current = null;
      showError(PRICE_REFRESH_COPY.slow);
    },
  });

  useEffect(
    () => () => {
      if (inFlight.current) void finishInBackground(inFlight.current);
    },
    [finishInBackground],
  );

  // Say how a finished refresh went, once. "Nothing newer" is a plain note, not a fault: no toast.
  const reported = useRef<PriceRefreshBaseline | null>(null);
  useEffect(() => {
    if (watching === null || outcome === "pending") return;
    inFlight.current = null;
    if (outcome === "unchanged" || reported.current === watching) return;
    reported.current = watching;
    if (outcome === "failed") {
      showError(PRICE_REFRESH_COPY.failed);
      return;
    }
    // New prices: the browser may still hold the old set for ten minutes, so read past that cache.
    void loadFresh(house)
      .unwrap()
      .then(() => showSuccess(PRICE_REFRESH_COPY.success))
      .catch(() => showError(PRICE_REFRESH_COPY.startFailed));
  }, [watching, outcome, house, loadFresh]);

  const refresh = useCallback(async () => {
    if (!state) return;
    setStarting(true);
    setWatching(null);
    setRunningNotice(null);
    syncClock();
    try {
      // The page's copy of the state may predate a scheduled run: measure "finished" from the server's word now.
      const current = await refetch().unwrap();
      const baseline = refreshBaselineOf(current);
      setWatching(baseline);
      inFlight.current = { house, baseline };
      const answer = await start(house).unwrap();
      // The server stamped its cooldown before answering: count from now, not from the click.
      syncClock();
      if (answer.status === "cooldown") {
        setWatching(null);
        inFlight.current = null;
        startCooldown(answer.retry_after_seconds);
      } else if (answer.status === "refreshing") {
        // A scheduled run holds the lock; it may not even be for this house. Don't wait on it.
        setWatching(null);
        inFlight.current = null;
        setRunningNotice(PRICE_REFRESH_COPY.alreadyRunning);
      }
    } catch (error) {
      setWatching(null);
      inFlight.current = null;
      const code = statusOf(error);
      if (code === TOO_MANY_REQUESTS) showError(PRICE_REFRESH_COPY.tooMany);
      else if (code === SERVICE_UNAVAILABLE) showError(PRICE_REFRESH_COPY.unavailable);
      else showError(PRICE_REFRESH_COPY.startFailed);
    } finally {
      setStarting(false);
    }
    // Either way the house has a new cooldown to show.
    void refetch();
  }, [state, start, house, refetch, syncClock, startCooldown]);

  return { isReady: state !== undefined, loadFailed: isError && state === undefined, isRefreshing, cooldownLeft, notice, refresh };
}
