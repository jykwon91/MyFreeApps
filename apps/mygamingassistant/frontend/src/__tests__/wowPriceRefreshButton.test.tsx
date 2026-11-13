/**
 * "Refresh now" on the Auction house page: loading at the click, waiting for the house's download time to
 * move, new prices vs. nothing newer from Blizzard vs. a failure, the cooldown, the server's refusals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { showError, showSuccess } from "@platform/ui";
import PriceRefreshButton from "@/games/wow-forever/components/prices/PriceRefreshButton";
import { refreshCooldownCopy } from "@/games/wow-forever/data/refreshCooldownCopy";
import {
  BLIZZARD_SNAPSHOT_INTERVAL_MS,
  PRICE_REFRESH_COPY,
  PRICE_REFRESH_POLL_MS,
  PRICE_REFRESH_WATCH_TIMEOUT_MS,
  priceRefreshUnchangedCopy,
} from "@/games/wow-forever/data/priceRefreshConfig";
import { minutesToNextSnapshot, refreshBaselineOf, refreshOutcome } from "@/games/wow-forever/prices/priceRefresh";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceRefreshResponse } from "@/games/wow-forever/types/priceRefreshResponse";
import type { PriceRefreshState } from "@/games/wow-forever/types/priceRefreshState";

const mockStart = vi.fn();
const mockLoadFresh = vi.fn();
const mockFinish = vi.fn();
let stateResult: { currentData: PriceRefreshState | undefined; isError: boolean; refetch: () => unknown };
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({
  useGetWowPriceRefreshStateQuery: () => stateResult,
  useFinishPriceRefreshMutation: () => [mockFinish],
  useRefreshWowPricesMutation: () => [(house: PriceHouse) => ({ unwrap: () => mockStart(house) })],
  useLoadFreshWowPricesMutation: () => [(house: PriceHouse) => ({ unwrap: () => mockLoadFresh(house) })],
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const HOUSE: PriceHouse = { server: "pvp", faction: "alliance" };
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const SNAPSHOT = at(-30 * MINUTE_MS);
const DOWNLOADED = at(-2 * HOUR_MS);

function refreshState(overrides: Partial<PriceRefreshState> = {}): PriceRefreshState {
  return {
    source_updated_at: SNAPSHOT,
    fetched_at: DOWNLOADED,
    refresh_available_at: at(-MINUTE_MS),
    refresh_failed_at: null,
    ...overrides,
  };
}

function show(
  state: PriceRefreshState | undefined,
  isError = false,
  refetch: () => unknown = vi.fn(() => ({ unwrap: async () => state })),
) {
  stateResult = { currentData: state, isError, refetch };
  return refetch;
}

function started(): PriceRefreshResponse {
  return { status: "started", retry_after_seconds: 600 };
}

async function click() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockStart.mockReset();
  mockLoadFresh.mockReset();
  mockFinish.mockReset();
  mockLoadFresh.mockResolvedValue({});
  show(refreshState());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("refresh outcome", () => {
  const baseline = refreshBaselineOf(refreshState());

  it("is pending until the download time or the failure time moves", () => {
    expect(refreshOutcome(baseline, refreshState())).toBe("pending");
  });

  it("is updated when the download moved and Blizzard's snapshot did too", () => {
    expect(refreshOutcome(baseline, refreshState({ fetched_at: at(0), source_updated_at: at(-1000) }))).toBe("updated");
  });

  it("is unchanged when we downloaded again but the snapshot is the one we had", () => {
    expect(refreshOutcome(baseline, refreshState({ fetched_at: at(0) }))).toBe("unchanged");
  });

  it("is failed when only the failure time moved", () => {
    expect(refreshOutcome(baseline, refreshState({ refresh_failed_at: at(0) }))).toBe("failed");
  });

  it("says to come back an hour after the snapshot, but never sooner than the cooldown", () => {
    const now = Date.now();
    const snapshot = new Date(now - 40 * MINUTE_MS).toISOString();
    expect(minutesToNextSnapshot(snapshot, now, 10 * MINUTE_MS)).toBe(20);
    expect(minutesToNextSnapshot(snapshot, now, 25 * MINUTE_MS)).toBe(25);
    // A snapshot already older than an hour is late: wait out the cooldown.
    expect(minutesToNextSnapshot(new Date(now - BLIZZARD_SNAPSHOT_INTERVAL_MS - MINUTE_MS).toISOString(), now, 10 * MINUTE_MS)).toBe(10);
    expect(minutesToNextSnapshot(null, now, 10 * MINUTE_MS)).toBe(10);
  });
});

describe("PriceRefreshButton", () => {
  it("is ready to press, with a 44px touch target, when the house can be refreshed", () => {
    render(<PriceRefreshButton house={HOUSE} />);
    const button = screen.getByRole("button", { name: PRICE_REFRESH_COPY.button });
    expect(button).toBeEnabled();
    expect(button.className).toContain("min-h-[44px]");
  });

  it("shows a button-sized skeleton while the refresh state loads, and no button if it cannot be read", () => {
    show(undefined);
    const { rerender } = render(<PriceRefreshButton house={HOUSE} />);
    expect(screen.getByTestId("price-refresh-skeleton")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();

    show(undefined, true);
    rerender(<PriceRefreshButton house={HOUSE} />);
    expect(screen.queryByTestId("price-refresh-skeleton")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows loading at the click, polls, then loads the new prices and says so once a newer snapshot lands", async () => {
    mockStart.mockResolvedValue(started());
    const refetch = show(refreshState());
    const { rerender } = render(<PriceRefreshButton house={HOUSE} />);

    await click();

    expect(mockStart).toHaveBeenCalledWith(HOUSE);
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.loading })).toBeDisabled();
    (refetch as ReturnType<typeof vi.fn>).mockClear();
    act(() => void vi.advanceTimersByTime(PRICE_REFRESH_POLL_MS));
    expect(refetch).toHaveBeenCalled();

    show(refreshState({ fetched_at: at(0), source_updated_at: at(-1000), refresh_available_at: at(10 * MINUTE_MS) }), false, refetch);
    await act(async () => {
      rerender(<PriceRefreshButton house={HOUSE} />);
    });

    expect(mockLoadFresh).toHaveBeenCalledWith(HOUSE);
    expect(showSuccess).toHaveBeenCalledWith(PRICE_REFRESH_COPY.success);
    expect(showError).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: PRICE_REFRESH_COPY.loading })).toBeNull();
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(10));
  });

  it("says plainly that Blizzard has nothing newer, never that it updated", async () => {
    mockStart.mockResolvedValue(started());
    const refetch = show(refreshState());
    const { rerender } = render(<PriceRefreshButton house={HOUSE} />);
    await click();

    // Downloaded again (fetched_at moved) but the snapshot is the same one: 30 minutes old, so ~30 more to go.
    show(refreshState({ fetched_at: at(0), refresh_available_at: at(10 * MINUTE_MS) }), false, refetch);
    await act(async () => {
      rerender(<PriceRefreshButton house={HOUSE} />);
    });

    const message = priceRefreshUnchangedCopy(30);
    // Not a fault: no red toast, just a plain note that stays until the next click.
    expect(showError).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(mockLoadFresh).not.toHaveBeenCalled();
    const note = screen.getByRole("status");
    expect(note.textContent).toBe(message);
    expect(note.className).toContain("text-muted-foreground");
  });

  it("keeps the nothing-newer note after the cooldown and clears it at the next click", async () => {
    mockStart.mockResolvedValue(started());
    show(refreshState());
    const { rerender } = render(<PriceRefreshButton house={HOUSE} />);
    await click();
    // A re-read at the next click returns the same state the page now shows.
    show(refreshState({ fetched_at: at(0), refresh_available_at: at(-MINUTE_MS) }));
    await act(async () => {
      rerender(<PriceRefreshButton house={HOUSE} />);
    });
    expect(screen.getByRole("status").textContent).toBe(priceRefreshUnchangedCopy(30));
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeEnabled();

    await click();

    expect(screen.queryByText(priceRefreshUnchangedCopy(30))).toBeNull();
  });

  it("measures a refresh from the state read at the click, not the page's older copy", async () => {
    mockStart.mockResolvedValue(started());
    // The page loaded this, then a scheduled run downloaded the house before the click.
    const loaded = refreshState();
    const afterScheduledRun = refreshState({ fetched_at: at(-1000), source_updated_at: at(-2000) });
    // The re-read at the click updates the page's copy too, as the real query does.
    const reread = vi.fn(() => {
      stateResult = { ...stateResult, currentData: afterScheduledRun };
      return { unwrap: async () => afterScheduledRun };
    });
    show(loaded, false, reread);
    render(<PriceRefreshButton house={HOUSE} />);

    // Nothing has finished yet: the poll sees that same scheduled-run state.
    await click();

    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.loading })).toBeDisabled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(mockLoadFresh).not.toHaveBeenCalled();
  });

  it("shows loading at the click, before the state is read again", async () => {
    let release: (state: PriceRefreshState) => void = () => undefined;
    const pending = new Promise<PriceRefreshState>((resolve) => {
      release = resolve;
    });
    mockStart.mockResolvedValue(started());
    show(refreshState(), false, vi.fn(() => ({ unwrap: () => pending })));
    render(<PriceRefreshButton house={HOUSE} />);

    await click();

    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.loading })).toBeDisabled();
    expect(mockStart).not.toHaveBeenCalled();
    await act(async () => release(refreshState()));
    expect(mockStart).toHaveBeenCalledWith(HOUSE);
  });

  it("says so when Blizzard did not answer the refresh", async () => {
    mockStart.mockResolvedValue(started());
    const refetch = show(refreshState());
    const { rerender } = render(<PriceRefreshButton house={HOUSE} />);
    await click();

    show(refreshState({ refresh_failed_at: at(0) }), false, refetch);
    await act(async () => {
      rerender(<PriceRefreshButton house={HOUSE} />);
    });

    expect(showError).toHaveBeenCalledWith(PRICE_REFRESH_COPY.failed);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(mockLoadFresh).not.toHaveBeenCalled();
  });

  it("stops waiting and says a refresh is already running when a scheduled one holds the lock", async () => {
    mockStart.mockResolvedValue({ status: "refreshing", retry_after_seconds: 0 });
    show(refreshState());
    render(<PriceRefreshButton house={HOUSE} />);

    await click();

    // The lock is per game, so that run may be for another house: no waiting on a house that never moves.
    expect(screen.getByRole("status").textContent).toBe(PRICE_REFRESH_COPY.alreadyRunning);
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeEnabled();
    expect(showError).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(PRICE_REFRESH_WATCH_TIMEOUT_MS));
    expect(showError).not.toHaveBeenCalled();
  });

  it("stops waiting after a while and says it is still running", async () => {
    mockStart.mockResolvedValue(started());
    render(<PriceRefreshButton house={HOUSE} />);
    await click();

    act(() => void vi.advanceTimersByTime(PRICE_REFRESH_WATCH_TIMEOUT_MS));

    expect(showError).toHaveBeenCalledWith(PRICE_REFRESH_COPY.slow);
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeEnabled();
  });

  it("is disabled during the cooldown and says for how long", () => {
    show(refreshState({ refresh_available_at: at(7 * MINUTE_MS - 5_000) }));
    render(<PriceRefreshButton house={HOUSE} />);
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(7));
  });

  it("comes back on its own when the cooldown runs out", () => {
    show(refreshState({ refresh_available_at: at(MINUTE_MS) }));
    render(<PriceRefreshButton house={HOUSE} />);
    act(() => void vi.advanceTimersByTime(MINUTE_MS + 1));
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("waits out a cooldown the server enforced (a click from another tab), without an error toast", async () => {
    mockStart.mockResolvedValue({ status: "cooldown", retry_after_seconds: 240 });
    render(<PriceRefreshButton house={HOUSE} />);

    await click();

    expect(showError).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(4));
  });

  it("counts the server's wait from this device's clock, not the server's timestamp", async () => {
    // The server's timestamp is far in the past by this device's clock (clock skew).
    show(refreshState({ refresh_available_at: at(-3 * HOUR_MS) }));
    mockStart.mockResolvedValue({ status: "cooldown", retry_after_seconds: 540 });
    render(<PriceRefreshButton house={HOUSE} />);

    await click();

    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(9));
  });

  it("counts the cooldown note down by the minute", () => {
    show(refreshState({ refresh_available_at: at(7 * MINUTE_MS - 5_000) }));
    render(<PriceRefreshButton house={HOUSE} />);
    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(7));

    act(() => void vi.advanceTimersByTime(MINUTE_MS));

    expect(screen.getByRole("status").textContent).toBe(refreshCooldownCopy(6));
  });

  it.each([
    [429, PRICE_REFRESH_COPY.tooMany],
    [503, PRICE_REFRESH_COPY.unavailable],
    [500, PRICE_REFRESH_COPY.startFailed],
  ])("says what went wrong when the server answers %i", async (status, message) => {
    mockStart.mockRejectedValue({ status });
    render(<PriceRefreshButton house={HOUSE} />);

    await click();

    expect(showError).toHaveBeenCalledWith(message);
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeEnabled();
  });

  it("forgets a refresh being watched when another house is shown", async () => {
    mockStart.mockResolvedValue(started());
    const { rerender } = render(<PriceRefreshButton key="pvp-alliance" house={HOUSE} />);
    await click();
    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.loading })).toBeDisabled();

    // The page keys the button by house, so another house mounts it afresh.
    rerender(<PriceRefreshButton key="pvp-horde" house={{ server: "pvp", faction: "horde" }} />);

    expect(screen.getByRole("button", { name: PRICE_REFRESH_COPY.button })).toBeEnabled();
  });

  it("follows a refresh to its end when the page walks away from it, so that house's prices don't stay stale", async () => {
    mockStart.mockResolvedValue(started());
    const { unmount } = render(<PriceRefreshButton key="pvp-alliance" house={HOUSE} />);
    await click();
    expect(mockFinish).not.toHaveBeenCalled();

    unmount();

    expect(mockFinish).toHaveBeenCalledWith({ house: HOUSE, baseline: refreshBaselineOf(refreshState()) });
  });

  it("leaves nothing to follow when no refresh is running", () => {
    const { unmount } = render(<PriceRefreshButton house={HOUSE} />);

    unmount();

    expect(mockFinish).not.toHaveBeenCalled();
  });
});
