/**
 * Following a refresh the page walked away from: new prices are loaded, nothing else is, hiccups are
 * retried, and the wait ends at the deadline without ever throwing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRICE_REFRESH_POLL_MS,
  PRICE_REFRESH_WATCH_TIMEOUT_MS,
} from "@/games/wow-forever/data/priceRefreshConfig";
import { followPriceRefresh } from "@/games/wow-forever/prices/followPriceRefresh";
import { refreshBaselineOf } from "@/games/wow-forever/prices/priceRefresh";
import type { PriceRefreshState } from "@/games/wow-forever/types/priceRefreshState";

const MINUTE_MS = 60_000;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const BEFORE: PriceRefreshState = {
  source_updated_at: at(-30 * MINUTE_MS),
  fetched_at: at(-2 * MINUTE_MS * 60),
  refresh_available_at: null,
  refresh_failed_at: null,
};
const BASELINE = refreshBaselineOf(BEFORE);

const readState = vi.fn<() => Promise<PriceRefreshState>>();
const loadFresh = vi.fn<() => Promise<unknown>>();

async function follow(): Promise<void> {
  const done = followPriceRefresh(BASELINE, { readState, loadFresh });
  await vi.advanceTimersByTimeAsync(PRICE_REFRESH_WATCH_TIMEOUT_MS + PRICE_REFRESH_POLL_MS);
  await done;
}

beforeEach(() => {
  vi.useFakeTimers();
  readState.mockReset();
  loadFresh.mockReset();
  loadFresh.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("followPriceRefresh", () => {
  it("loads the new prices once a newer snapshot has landed", async () => {
    readState.mockResolvedValueOnce(BEFORE).mockResolvedValue({ ...BEFORE, fetched_at: at(0), source_updated_at: at(-1000) });

    await follow();

    expect(loadFresh).toHaveBeenCalledTimes(1);
    expect(readState).toHaveBeenCalledTimes(2);
  });

  it("loads nothing when Blizzard had nothing newer", async () => {
    readState.mockResolvedValue({ ...BEFORE, fetched_at: at(0) });

    await follow();

    expect(loadFresh).not.toHaveBeenCalled();
    expect(readState).toHaveBeenCalledTimes(1);
  });

  it("loads nothing when the refresh failed", async () => {
    readState.mockResolvedValue({ ...BEFORE, refresh_failed_at: at(0) });

    await follow();

    expect(loadFresh).not.toHaveBeenCalled();
  });

  it("tries again after a read that failed", async () => {
    readState.mockRejectedValueOnce(new Error("network")).mockResolvedValue({ ...BEFORE, fetched_at: at(0), source_updated_at: at(-1000) });

    await follow();

    expect(loadFresh).toHaveBeenCalledTimes(1);
    expect(readState).toHaveBeenCalledTimes(2);
  });

  it("tries again after a load that failed", async () => {
    readState.mockResolvedValue({ ...BEFORE, fetched_at: at(0), source_updated_at: at(-1000) });
    loadFresh.mockRejectedValueOnce(new Error("network")).mockResolvedValue({});

    await follow();

    expect(loadFresh).toHaveBeenCalledTimes(2);
  });

  it("stops at the deadline when the refresh never finishes, and never throws", async () => {
    readState.mockResolvedValue(BEFORE);

    await expect(follow()).resolves.toBeUndefined();

    expect(readState.mock.calls.length).toBeLessThanOrEqual(PRICE_REFRESH_WATCH_TIMEOUT_MS / PRICE_REFRESH_POLL_MS);
    expect(loadFresh).not.toHaveBeenCalled();
  });

  it("stops at the deadline when every read fails, and never throws", async () => {
    readState.mockRejectedValue(new Error("down"));

    await expect(follow()).resolves.toBeUndefined();

    expect(loadFresh).not.toHaveBeenCalled();
  });
});
