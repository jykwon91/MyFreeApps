/**
 * Unit tests for the GSI client module (`lib/gsi.ts`).
 *
 * Coverage:
 *   - `useGsiState` returns null event + ready=true on web (no Tauri shim)
 *   - `useGsiState` subscribes to `gsi:state-update` + `gsi:server-status`
 *     under Tauri and surfaces emitted payloads
 *   - `useGsiState` unsubscribes on unmount
 *   - `summarizeLiveBar` formats fields correctly
 *   - `summarizeLiveBar` returns null for empty / null events
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { summarizeLiveBar, useGsiState } from "@/lib/gsi";
import type { GsiEvent, GsiServerStatus } from "@/types/desktop";

// Mock both the dynamic event listener and the dynamic invoke API.
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

describe("useGsiState on web (no Tauri)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    clearTauri();
  });
  afterEach(clearTauri);

  it("returns null event/status and ready=true synchronously", async () => {
    const { result } = renderHook(() => useGsiState());

    // ready flips to true on mount because the web branch short-circuits.
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.event).toBeNull();
    expect(result.current.status).toBeNull();
    expect(mockListen).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("useGsiState under Tauri", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    clearTauri();
    injectTauri();
  });
  afterEach(clearTauri);

  it("subscribes to both events and surfaces emitted payloads", async () => {
    // Capture the listeners passed in so we can fire them manually.
    let stateUpdateHandler: ((e: { payload: GsiEvent }) => void) | null = null;
    let serverStatusHandler: ((e: { payload: GsiServerStatus }) => void) | null = null;

    mockListen.mockImplementation(async (eventName, handler) => {
      if (eventName === "gsi:state-update") stateUpdateHandler = handler;
      else if (eventName === "gsi:server-status") serverStatusHandler = handler;
      // listen() returns an unlisten function
      return vi.fn();
    });

    mockInvoke.mockResolvedValue({
      running: true,
      port: 8765,
      payloads_received: 0,
      auth_token_loaded: true,
    });

    const { result } = renderHook(() => useGsiState());

    // Wait for both subscribes + the bootstrap status to settle.
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mockListen).toHaveBeenCalledWith("gsi:state-update", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("gsi:server-status", expect.any(Function));
    expect(mockInvoke).toHaveBeenCalledWith("gsi_server_status", undefined);

    // Initial bootstrap status should be reflected.
    expect(result.current.status).toMatchObject({
      running: true,
      port: 8765,
    });

    // Simulate a pushed event.
    await act(async () => {
      stateUpdateHandler?.({
        payload: {
          map_slug: "mirage",
          map_phase: "live",
          side: "side_a",
          round_phase: "freezetime",
          activity: "playing",
          received_at: "2026-05-13T10:00:00Z",
        },
      });
      serverStatusHandler?.({
        payload: {
          running: true,
          port: 8765,
          payloads_received: 1,
          last_event_at: "2026-05-13T10:00:00Z",
          auth_token_loaded: true,
        },
      });
    });

    expect(result.current.event?.map_slug).toBe("mirage");
    expect(result.current.event?.side).toBe("side_a");
    expect(result.current.status?.payloads_received).toBe(1);
  });

  it("calls the unlisten callbacks on unmount", async () => {
    const unlistenStateUpdate = vi.fn();
    const unlistenServerStatus = vi.fn();
    mockListen
      .mockResolvedValueOnce(unlistenStateUpdate)
      .mockResolvedValueOnce(unlistenServerStatus);
    mockInvoke.mockResolvedValue({
      running: false,
      port: 8765,
      payloads_received: 0,
      auth_token_loaded: false,
    });

    const { result, unmount } = renderHook(() => useGsiState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    unmount();

    expect(unlistenStateUpdate).toHaveBeenCalled();
    expect(unlistenServerStatus).toHaveBeenCalled();
  });
});

describe("summarizeLiveBar", () => {
  it("returns null for null event", () => {
    expect(summarizeLiveBar(null)).toBeNull();
  });

  it("returns null when map_slug and map_phase are empty (menu state)", () => {
    const result = summarizeLiveBar({
      map_slug: "",
      map_phase: "",
      side: "any",
      round_phase: "",
      activity: "menu",
      received_at: "2026-05-13T10:00:00Z",
    });
    expect(result).toBeNull();
  });

  it("capitalizes map name and translates side and phase", () => {
    const result = summarizeLiveBar({
      map_slug: "mirage",
      map_phase: "live",
      side: "side_b",
      round_phase: "live",
      activity: "playing",
      received_at: "2026-05-13T10:00:00Z",
    });
    expect(result).not.toBeNull();
    expect(result!.mapDisplay).toBe("Mirage");
    expect(result!.sideDisplay).toBe("CT");
    expect(result!.phaseDisplay).toBe("Live");
  });

  it("capitalizes multi-word slugs with dashes", () => {
    const result = summarizeLiveBar({
      map_slug: "train",
      map_phase: "warmup",
      side: "side_a",
      round_phase: "freezetime",
      activity: "playing",
      received_at: "2026-05-13T10:00:00Z",
    });
    expect(result!.mapDisplay).toBe("Train");
    expect(result!.sideDisplay).toBe("T");
    expect(result!.phaseDisplay).toBe("Warmup");
  });

  it("falls back to slug for unknown phase", () => {
    const result = summarizeLiveBar({
      map_slug: "anubis",
      map_phase: "weird_new_phase",
      side: "any",
      round_phase: "",
      activity: "",
      received_at: "2026-05-13T10:00:00Z",
    });
    expect(result!.phaseDisplay).toBe("weird_new_phase");
  });
});
