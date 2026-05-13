/**
 * Unit tests for `useCalibrationDraft`. Exercises the reducer surface
 * (dirty flags, undo/redo, reset) without hitting the real Tauri IPC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCalibrationDraft } from "@/hooks/useCalibrationDraft";
import type { CvMapCalibrationPackage } from "@/types/desktop";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

function injectTauri() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: () => undefined,
  };
}
function clearTauri() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

const samplePkg: CvMapCalibrationPackage = {
  map_slug: "mirage",
  calibration: {
    schema_version: 1,
    resolution: "1920x1080",
    minimap_region: { x: 16, y: 16, width: 280, height: 280 },
    world_transform: { scale_x: 0.003571, scale_y: 0.003571, offset_x: 0, offset_y: 0 },
    dot_detection: {
      target_rgb: [255, 255, 0] as [number, number, number],
      color_tolerance: 30,
      min_area_px: 6,
      max_area_px: 80,
    },
  },
  zones: [
    {
      slug: "a-site",
      name: "A Site",
      points: [
        [0.6, 0.2] as [number, number],
        [0.85, 0.2] as [number, number],
        [0.85, 0.4] as [number, number],
        [0.6, 0.4] as [number, number],
      ],
    },
  ],
};

describe("useCalibrationDraft — web build", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    clearTauri();
  });

  it("loads to null with ready=true on web", async () => {
    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.loaded).toBeNull();
    expect(result.current.state.draft).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("useCalibrationDraft — under Tauri", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    injectTauri();
    mockInvoke.mockResolvedValue(samplePkg);
  });
  afterEach(clearTauri);

  it("loads via cv_get_calibration and seeds draft + loaded", async () => {
    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.loaded?.map_slug).toBe("mirage");
    expect(result.current.state.draft?.zones).toHaveLength(1);
    expect(result.current.dirtySections).toEqual({
      region: false,
      zones: false,
      dots: false,
    });
  });

  it("setRegion flips region dirty + supports undo", async () => {
    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.setRegion({ x: 100, y: 100, width: 300, height: 300 });
    });
    expect(result.current.dirtySections.region).toBe(true);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.dirtySections.region).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.dirtySections.region).toBe(true);
  });

  it("setDot flips dots dirty without affecting region or zones", async () => {
    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.setDot({
        target_rgb: [0, 255, 100],
        color_tolerance: 50,
        min_area_px: 10,
        max_area_px: 60,
      });
    });
    expect(result.current.dirtySections.dots).toBe(true);
    expect(result.current.dirtySections.region).toBe(false);
    expect(result.current.dirtySections.zones).toBe(false);
  });

  it("setZones flips zones dirty without affecting other sections", async () => {
    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.setZones([]);
    });
    expect(result.current.dirtySections.zones).toBe(true);
    expect(result.current.dirtySections.region).toBe(false);
  });

  it("resetSection reverts to baseline", async () => {
    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.setRegion({ x: 0, y: 0, width: 1, height: 1 });
    });
    expect(result.current.dirtySections.region).toBe(true);

    act(() => result.current.resetSection("region"));
    expect(result.current.dirtySections.region).toBe(false);
  });

  it("saveSection promotes draft to loaded for the saved section", async () => {
    // First call returns samplePkg (load), second returns "/path/...json" (save)
    mockInvoke.mockReset();
    mockInvoke
      .mockResolvedValueOnce(samplePkg) // cv_get_calibration
      .mockResolvedValueOnce("/path/mirage_1920x1080.json"); // cv_set_calibration

    const { result } = renderHook(() =>
      useCalibrationDraft({ mapSlug: "mirage", resolution: "1920x1080" }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.setRegion({ x: 100, y: 100, width: 300, height: 300 });
    });
    expect(result.current.dirtySections.region).toBe(true);

    await act(async () => {
      await result.current.saveSection("region");
    });
    expect(result.current.dirtySections.region).toBe(false);
    // Source promoted to "override" after a save
    expect(result.current.state.source).toBe("override");
  });
});
