/**
 * useDelayedAction — the undo window behind Approve / Not planned / Hide / status changes: no call before
 * the timer, Undo cancels, flush sends at once, a hidden or closed tab sends everything, unmount sends,
 * and a 429 re-queues instead of dropping.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDelayedAction } from "@/games/wow-forever/hooks/featureRequests/triage/useDelayedAction";
import { triageErrorFrom } from "@/games/wow-forever/lib/featureRequests/triage/triageErrors";
import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";

const DELAY = 6000;

function action(id: string, run = vi.fn(() => Promise.resolve())): DelayedAction & { run: ReturnType<typeof vi.fn> } {
  return { id, label: `Approved: ${id}`, successMessage: null, run };
}

function setup() {
  const onSuccess = vi.fn();
  const onFailure = vi.fn();
  const hook = renderHook(() => useDelayedAction({ delayMs: DELAY, onSuccess, onFailure }));
  return { onSuccess, onFailure, ...hook };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDelayedAction", () => {
  it("waits the full window before calling, then reports success", async () => {
    const { result, onSuccess } = setup();
    const a = action("a");
    act(() => result.current.schedule(a));
    expect(result.current.pending).toEqual([{ id: "a", label: "Approved: a", phase: "waiting" }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAY - 1);
    });
    expect(a.run).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(a);
    expect(result.current.pending).toEqual([]);
  });

  it("undo cancels with no call", async () => {
    const { result } = setup();
    const a = action("a");
    act(() => result.current.schedule(a));
    let undone = false;
    act(() => {
      undone = result.current.undo("a");
    });
    expect(undone).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAY * 2);
    });
    expect(a.run).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual([]);
  });

  it("flush sends at once", async () => {
    const { result } = setup();
    const a = action("a");
    const b = action("b");
    act(() => {
      result.current.schedule(a);
      result.current.schedule(b);
    });
    await act(async () => {
      await result.current.flush("a");
    });
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(b.run).not.toHaveBeenCalled();
  });

  it("sends everything waiting on pagehide", async () => {
    const { result } = setup();
    const a = action("a");
    const b = action("b");
    act(() => {
      result.current.schedule(a);
      result.current.schedule(b);
    });
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(b.run).toHaveBeenCalledTimes(1);
  });

  it("sends everything when the tab is hidden", async () => {
    const { result } = setup();
    const a = action("a");
    act(() => result.current.schedule(a));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    visibility.mockRestore();
    expect(a.run).toHaveBeenCalledTimes(1);
  });

  it("sends what's waiting when the screen unmounts", async () => {
    const { result, unmount } = setup();
    const a = action("a");
    act(() => result.current.schedule(a));
    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.run).toHaveBeenCalledTimes(1);
  });

  it("re-queues after a 429 and sends again once Retry-After passes", async () => {
    const { result, onFailure, onSuccess } = setup();
    const run = vi
      .fn()
      .mockRejectedValueOnce(triageErrorFrom(429, { detail: "Too Many Requests" }, 5))
      .mockResolvedValueOnce(undefined);
    const a = action("a", run);
    act(() => result.current.schedule(a));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAY);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.rateLimitedUntil).not.toBeNull();
    expect(result.current.pending[0]?.phase).toBe("retrying");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(a);
    expect(result.current.rateLimitedUntil).toBeNull();
  });

  it("reports a failure without retrying", async () => {
    const { result, onFailure } = setup();
    const error = triageErrorFrom(500, null, null);
    const a = action("a", vi.fn().mockRejectedValue(error));
    act(() => result.current.schedule(a));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAY);
    });
    expect(onFailure).toHaveBeenCalledWith({ action: a, error, onPageHide: false });
  });
});
