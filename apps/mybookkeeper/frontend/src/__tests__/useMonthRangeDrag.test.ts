import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMonthRangeDrag } from "@/shared/hooks/useMonthRangeDrag";

const MONTHS: Record<string, string> = { "Aug 26": "2026-08", "Sep 26": "2026-09", "Oct 26": "2026-10" };

function setup() {
  const onRangeSelect = vi.fn();
  const hook = renderHook(() => useMonthRangeDrag((label) => MONTHS[label], onRangeSelect));
  return { hook, onRangeSelect };
}

describe("useMonthRangeDrag", () => {
  it("a drag picks the first day of the first month to the last day of the last", () => {
    const { hook, onRangeSelect } = setup();
    act(() => hook.result.current.handlers.onMouseDown({ activeLabel: "Aug 26" }));
    act(() => hook.result.current.handlers.onMouseMove({ activeLabel: "Oct 26" }));
    expect(hook.result.current.overlay).toEqual({ start: "Aug 26", end: "Oct 26" });
    expect(hook.result.current.wasDragged()).toBe(true);
    act(() => hook.result.current.handlers.onMouseUp());
    expect(onRangeSelect).toHaveBeenCalledWith({ startDate: "2026-08-01", endDate: "2026-10-31" });
    expect(hook.result.current.overlay).toBeNull();
  });

  it("a drag right to left picks the same months", () => {
    const { hook, onRangeSelect } = setup();
    act(() => hook.result.current.handlers.onMouseDown({ activeLabel: "Oct 26" }));
    act(() => hook.result.current.handlers.onMouseMove({ activeLabel: "Sep 26" }));
    act(() => hook.result.current.handlers.onMouseUp());
    expect(onRangeSelect).toHaveBeenCalledWith({ startDate: "2026-09-01", endDate: "2026-10-31" });
  });

  it("a click without a drag picks nothing and leaves bar clicks alone", () => {
    const { hook, onRangeSelect } = setup();
    act(() => hook.result.current.handlers.onMouseDown({ activeLabel: "Sep 26" }));
    act(() => hook.result.current.handlers.onMouseUp());
    expect(onRangeSelect).not.toHaveBeenCalled();
    expect(hook.result.current.wasDragged()).toBe(false);
  });

  it("leaving the chart mid-drag drops the drag", () => {
    const { hook, onRangeSelect } = setup();
    act(() => hook.result.current.handlers.onMouseDown({ activeLabel: "Aug 26" }));
    act(() => hook.result.current.handlers.onMouseMove({ activeLabel: "Sep 26" }));
    act(() => hook.result.current.handlers.onMouseLeave());
    act(() => hook.result.current.handlers.onMouseUp());
    expect(onRangeSelect).not.toHaveBeenCalled();
    expect(hook.result.current.overlay).toBeNull();
  });
});
