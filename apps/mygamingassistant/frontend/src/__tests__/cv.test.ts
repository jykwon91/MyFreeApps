/**
 * Unit tests for the CV pipeline client module (`lib/cv.ts`).
 *
 * Coverage:
 *   - `useCvState` returns null zone/status + ready=true on web (no Tauri)
 *   - `useCvState` subscribes to `cv:zone-detected` under Tauri and
 *     surfaces emitted payloads
 *   - `useCvState` unsubscribes on unmount
 *   - `useCvState` polls cv_status (one bootstrap call asserted; we don't
 *     wait the full 2s interval to keep tests fast)
 *   - `formatZoneDisplay` formats kebab-case slugs cleanly
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { formatZoneDisplay, useCvState } from "@/lib/cv";
import type { CvStatus, CvZoneDetectedEvent } from "@/types/desktop";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

function injectTauri() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke: () => undefined,
  };
}
function clearTauri() {
  if ("__TAURI_INTERNALS__" in window) {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

const sampleStatus: CvStatus = {
  running: false,
  platform_supported: true,
  current_map: null,
  last_zone: null,
  last_detection_at: null,
  ticks_total: 0,
  ticks_errored: 0,
  avg_tick_ms: 0,
  last_tick_ms: 0,
  calibration_loaded: false,
  last_error: null,
};

describe("useCvState on web (no Tauri)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    clearTauri();
  });
  afterEach(clearTauri);

  it("returns nulls and ready=true without calling Tauri APIs", async () => {
    const { result } = renderHook(() => useCvState());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.zone).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.lastEvent).toBeNull();
    expect(mockListen).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("useCvState under Tauri", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    clearTauri();
    injectTauri();
  });
  afterEach(clearTauri);

  it("subscribes to cv:zone-detected and surfaces payloads", async () => {
    let zoneHandler: ((e: { payload: CvZoneDetectedEvent }) => void) | null = null;
    mockListen.mockImplementation(async (eventName, handler) => {
      if (eventName === "cv:zone-detected") zoneHandler = handler;
      return vi.fn();
    });
    mockInvoke.mockResolvedValue({ ...sampleStatus, running: true, platform_supported: true });

    const { result } = renderHook(() => useCvState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(mockListen).toHaveBeenCalledWith("cv:zone-detected", expect.any(Function));
    expect(mockInvoke).toHaveBeenCalledWith("cv_status", undefined);
    expect(result.current.status?.running).toBe(true);

    // Fire a zone-detection event
    await act(async () => {
      zoneHandler?.({
        payload: {
          map_slug: "mirage",
          zone_slug: "a-site",
          confidence: 0.9,
          latency_ms: 5,
          detected_at: "2026-05-13T10:00:00Z",
        },
      });
    });

    expect(result.current.zone).toBe("a-site");
    expect(result.current.lastEvent?.zone_slug).toBe("a-site");
    expect(result.current.lastEvent?.confidence).toBe(0.9);
  });

  it("null zone_slug emission clears the zone", async () => {
    let zoneHandler: ((e: { payload: CvZoneDetectedEvent }) => void) | null = null;
    mockListen.mockImplementation(async (eventName, handler) => {
      if (eventName === "cv:zone-detected") zoneHandler = handler;
      return vi.fn();
    });
    mockInvoke.mockResolvedValue(sampleStatus);

    const { result } = renderHook(() => useCvState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      zoneHandler?.({
        payload: {
          map_slug: "mirage",
          zone_slug: "a-site",
          confidence: 0.9,
          latency_ms: 5,
          detected_at: "t1",
        },
      });
    });
    expect(result.current.zone).toBe("a-site");

    // Player walked off all zones
    await act(async () => {
      zoneHandler?.({
        payload: {
          map_slug: "mirage",
          zone_slug: null,
          confidence: 0.0,
          latency_ms: 5,
          detected_at: "t2",
        },
      });
    });
    expect(result.current.zone).toBeNull();
  });

  it("unsubscribes on unmount", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);
    mockInvoke.mockResolvedValue(sampleStatus);

    const { result, unmount } = renderHook(() => useCvState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    unmount();
    expect(unlisten).toHaveBeenCalled();
  });

  it("refresh() calls cv_status and updates state", async () => {
    mockListen.mockResolvedValue(vi.fn());
    let callCount = 0;
    mockInvoke.mockImplementation(async () => {
      callCount += 1;
      // First call (bootstrap) returns running=false; subsequent calls
      // return running=true so we can assert the refresh worked.
      return { ...sampleStatus, running: callCount > 1 };
    });

    const { result } = renderHook(() => useCvState());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status?.running).toBe(false);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status?.running).toBe(true);
  });
});

describe("formatZoneDisplay", () => {
  it("returns dash for null", () => {
    expect(formatZoneDisplay(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(formatZoneDisplay(undefined)).toBe("—");
  });

  it("returns dash for empty string", () => {
    expect(formatZoneDisplay("")).toBe("—");
  });

  it("capitalizes single-word slug", () => {
    expect(formatZoneDisplay("mid")).toBe("Mid");
  });

  it("capitalizes kebab-case slug", () => {
    expect(formatZoneDisplay("a-site")).toBe("A Site");
    expect(formatZoneDisplay("b-apts")).toBe("B Apts");
    expect(formatZoneDisplay("ct-spawn")).toBe("Ct Spawn");
  });

  it("capitalizes snake_case slug", () => {
    expect(formatZoneDisplay("a_long")).toBe("A Long");
  });
});
