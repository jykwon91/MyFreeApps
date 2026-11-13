import { useCallback, useEffect, useRef, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import {
  useGetWowPriceRefreshStateQuery,
  useLoadFreshWowPricesMutation,
  useRefreshWowPricesMutation,
} from "@/games/wow-forever/api/wowPricesApi";
import { refreshCooldownCopy } from "@/games/wow-forever/data/refreshCooldownCopy";
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
import { cooldownMinutes } from "@/games/wow-forever/lib/refreshCooldown";
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
  /** After a refresh that found no newer Blizzard snapshot: "Blizzard hasn't published newer prices yet — try again in ~N min". */
  notice: string | null;
  refresh: () => Promise<void>;
}

/**
 * "Refresh now" on the Auction house page. A click asks the server to pull this house from Blizzard
 * (it answers at once and works in the background); the page then re-reads the house's refresh state
 * until its download time or failure time moves, and says how it went: new prices (loaded past the
 * browser cache into the shared price cache), nothing newer from Blizzard, or Blizzard didn't answer.
 * The cooldown comes from the server (`refresh_available_at`). It watches one house: key the caller
 * by house so another house starts clean.
 */
export function usePriceRefresh(house: PriceHouse): PriceRefresh {
  const { currentData: state, isError, refetch } = useGetWowPriceRefreshStateQuery(house);
  const [start] = useRefreshWowPricesMutation();
  const [loadFresh] = useLoadFreshWowPricesMutation();
  const [watching, setWatching] = useState<PriceRefreshBaseline | null>(null);
  const { cooldownLeft, nowMs, syncClock } = useRefreshCooldown(state?.refresh_available_at ?? null);

  const outcome = watching !== null && state ? refreshOutcome(watching, state) : "pending";
  const isRefreshing = watching !== null && outcome === "pending";
  const notice =
    outcome === "unchanged" && state
      ? priceRefreshUnchangedCopy(minutesToNextSnapshot(state.source_updated_at, nowMs, cooldownLeft))
      : null;

  useRefreshWatch(isRefreshing, refetch, {
    pollMs: PRICE_REFRESH_POLL_MS,
    timeoutMs: PRICE_REFRESH_WATCH_TIMEOUT_MS,
    onPoll: syncClock,
    onGiveUp: () => {
      setWatching(null);
      showError(PRICE_REFRESH_COPY.slow);
    },
  });

  // Say how a finished refresh went, once.
  const reported = useRef<PriceRefreshBaseline | null>(null);
  useEffect(() => {
    if (watching === null || !state || outcome === "pending" || reported.current === watching) return;
    reported.current = watching;
    if (outcome === "failed") {
      showError(PRICE_REFRESH_COPY.failed);
    } else if (outcome === "unchanged") {
      if (notice) showError(notice);
    } else {
      // New prices: the browser may still hold the old set for ten minutes, so read past that cache.
      void loadFresh(house)
        .unwrap()
        .then(() => showSuccess(PRICE_REFRESH_COPY.success))
        .catch(() => showError(PRICE_REFRESH_COPY.startFailed));
    }
  }, [watching, state, outcome, notice, house, loadFresh]);

  const refresh = useCallback(async () => {
    if (!state) return;
    setWatching(refreshBaselineOf(state));
    syncClock();
    try {
      const answer = await start(house).unwrap();
      // The server stamped its cooldown before answering: count from now, not from the click.
      syncClock();
      if (answer.status === "cooldown") {
        setWatching(null);
        showError(refreshCooldownCopy(cooldownMinutes(answer.retry_after_seconds * 1000)));
      }
    } catch (error) {
      setWatching(null);
      const code = statusOf(error);
      if (code === TOO_MANY_REQUESTS) showError(PRICE_REFRESH_COPY.tooMany);
      else if (code === SERVICE_UNAVAILABLE) showError(PRICE_REFRESH_COPY.unavailable);
      else showError(PRICE_REFRESH_COPY.startFailed);
    }
    // Either way the house has a new cooldown to show.
    void refetch();
  }, [state, start, house, refetch, syncClock]);

  return { isReady: state !== undefined, loadFailed: isError && state === undefined, isRefreshing, cooldownLeft, notice, refresh };
}
