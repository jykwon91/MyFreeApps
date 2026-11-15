import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCarriedMapView } from "../useCarriedMapView";
import { FULL_VIEW } from "@/games/wow-forever/worldMap/mapViewport";

const ZOOMED = { scale: 3, centerX: 0.4, centerY: 0.6 };

describe("useCarriedMapView", () => {
  it("forwards every view change and pins the latest one for the next map", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useCarriedMapView(1429, onChange));
    expect(result.current.carried).toBeNull();
    act(() => result.current.track(ZOOMED));
    expect(onChange).toHaveBeenCalledWith(ZOOMED);
    act(() => result.current.carry());
    expect(result.current.carried).toEqual({ mapId: 1429, zoom: ZOOMED });
    act(() => result.current.clear());
    expect(result.current.carried).toBeNull();
  });

  it("carries the full view when the player never zoomed, and nothing without a map", () => {
    const { result } = renderHook(() => useCarriedMapView(1429, vi.fn()));
    act(() => result.current.carry());
    expect(result.current.carried).toEqual({ mapId: 1429, zoom: FULL_VIEW });
    const none = renderHook(() => useCarriedMapView(null, vi.fn()));
    act(() => none.result.current.carry());
    expect(none.result.current.carried).toBeNull();
  });
});
