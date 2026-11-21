// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_RESET_MARGIN_MS } from "../constants/dailyReset";
import { useAtDailyReset } from "../hooks/useAtDailyReset";

const FIFTEEN_UTC = new Date("2026-11-20T15:00:00Z");
const HOURS_TO_RESET = 9;
const HOUR_MS = 3_600_000;

describe("useAtDailyReset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIFTEEN_UTC);
  });
  afterEach(() => vi.useRealTimers());

  it("runs once at the reset while active, not before", () => {
    const onReset = vi.fn();
    renderHook(() => useAtDailyReset(true, onReset));

    vi.advanceTimersByTime(HOURS_TO_RESET * HOUR_MS - 1);
    expect(onReset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + DAILY_RESET_MARGIN_MS);
    expect(onReset).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(24 * HOUR_MS);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive", () => {
    const onReset = vi.fn();
    renderHook(() => useAtDailyReset(false, onReset));
    vi.advanceTimersByTime(48 * HOUR_MS);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("is cleared when it stops being active or unmounts", () => {
    const onReset = vi.fn();
    const { rerender, unmount } = renderHook(({ active }) => useAtDailyReset(active, onReset), { initialProps: { active: true } });
    rerender({ active: false });
    vi.advanceTimersByTime(24 * HOUR_MS);
    expect(onReset).not.toHaveBeenCalled();

    rerender({ active: true });
    unmount();
    vi.advanceTimersByTime(24 * HOUR_MS);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("calls the latest callback, without restarting the timer", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAtDailyReset(true, cb), { initialProps: { cb: first } });
    vi.advanceTimersByTime(HOUR_MS);
    rerender({ cb: second });
    vi.advanceTimersByTime(HOURS_TO_RESET * HOUR_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
