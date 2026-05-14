/**
 * Unit tests for the GSI client module (`lib/gsi.ts`).
 *
 * Coverage:
 *   - `useGsiState` returns null event + ready=true on web (no Tauri shim)
 *   - `useGsiState` subscribes to `gsi:state-update` + `gsi:server-status`
 *     under Tauri and surfaces emitted payloads
 *   - `useGsiState` unsubscribes on unmount
 *   - `summarizeLiveBar` formats fields correctly — base PR 8 shape +
 *     PR 10 score/money/bomb/round-phase additions
 *   - `summarizeLiveBar` returns null for empty / null events
 *   - `computeLineupUtilityFilter` follows the override → active → held
 *     preference order (PR 10)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  computeLineupUtilityFilter,
  summarizeLiveBar,
  useGsiState,
} from "@/lib/gsi";
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

// Helper: build a minimal GsiEvent for tests. Avoids 10+ null fields in
// every individual test (especially after PR 10 added typed HUD fields).
function buildEvent(overrides: Partial<GsiEvent> = {}): GsiEvent {
  return {
    map_slug: "",
    map_phase: "",
    side: "any",
    round_phase: "",
    activity: "",
    held_utility_slugs: [],
    received_at: "2026-05-13T10:00:00Z",
    ...overrides,
  };
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

    // Simulate a pushed event with PR 10 typed fields populated.
    await act(async () => {
      stateUpdateHandler?.({
        payload: buildEvent({
          map_slug: "mirage",
          map_phase: "live",
          side: "side_a",
          round_phase: "freezetime",
          activity: "playing",
          money: 4150,
          ct_score: 3,
          t_score: 2,
          active_weapon: "weapon_smokegrenade",
          active_utility: "smoke",
          held_utility_slugs: ["smoke", "flash"],
        }),
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
    expect(result.current.event?.active_utility).toBe("smoke");
    expect(result.current.event?.held_utility_slugs).toEqual(["smoke", "flash"]);
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

// ===========================================================================
// summarizeLiveBar
// ===========================================================================

describe("summarizeLiveBar", () => {
  it("returns null for null event", () => {
    expect(summarizeLiveBar(null)).toBeNull();
  });

  it("returns null when map_slug and map_phase are empty (menu state)", () => {
    expect(
      summarizeLiveBar(buildEvent({ activity: "menu" })),
    ).toBeNull();
  });

  it("capitalizes map name and translates side and phase", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        side: "side_b",
        round_phase: "live",
        activity: "playing",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.mapDisplay).toBe("Mirage");
    expect(result!.sideDisplay).toBe("CT");
    expect(result!.phaseDisplay).toBe("Live");
    expect(result!.roundPhaseDisplay).toBe("Live");
  });

  it("capitalizes multi-word slugs with dashes", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "train",
        map_phase: "warmup",
        side: "side_a",
        round_phase: "freezetime",
        activity: "playing",
      }),
    );
    expect(result!.mapDisplay).toBe("Train");
    expect(result!.sideDisplay).toBe("T");
    expect(result!.phaseDisplay).toBe("Warmup");
    expect(result!.roundPhaseDisplay).toBe("Freezetime");
  });

  it("falls back to slug for unknown phase", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "anubis",
        map_phase: "weird_new_phase",
        side: "any",
      }),
    );
    expect(result!.phaseDisplay).toBe("weird_new_phase");
  });

  // ----- PR 10: score / money / bomb / round-phase / equip-extra -----

  it("formats money with thousands separator", () => {
    const result = summarizeLiveBar(
      buildEvent({ map_slug: "mirage", map_phase: "live", money: 4150 }),
    );
    expect(result!.moneyDisplay).toBe("$4,150");
  });

  it("renders moneyDisplay as null when money is missing", () => {
    const result = summarizeLiveBar(
      buildEvent({ map_slug: "mirage", map_phase: "live" }),
    );
    expect(result!.moneyDisplay).toBeNull();
  });

  it("formats score as CT-T order regardless of player side", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        side: "side_a",
        ct_score: 12,
        t_score: 8,
      }),
    );
    expect(result!.scoreDisplay).toBe("12-8");
  });

  it("renders scoreDisplay as null when only one score is present", () => {
    const result = summarizeLiveBar(
      buildEvent({ map_slug: "mirage", map_phase: "live", ct_score: 12 }),
    );
    expect(result!.scoreDisplay).toBeNull();
  });

  it("surfaces +kit when helmet + armor>0", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        helmet: true,
        armor: 100,
      }),
    );
    expect(result!.equipExtra).toBe(" +kit");
  });

  it("does NOT show +kit when armor is 0 (helmet flag stale)", () => {
    // CS2 leaves the helmet flag true even after armor depletes — we
    // suppress the +kit display because the player is effectively
    // helmet-less for damage purposes.
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        helmet: true,
        armor: 0,
      }),
    );
    expect(result!.equipExtra).toBe("");
  });

  it("surfaces +defuse for CT with defuse kit but no helmet", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        defuse_kit: true,
      }),
    );
    expect(result!.equipExtra).toBe(" +defuse");
  });

  it("combines +kit and +defuse when both present", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        helmet: true,
        armor: 100,
        defuse_kit: true,
      }),
    );
    expect(result!.equipExtra).toBe(" +kit +defuse");
  });

  it("emits the bomb-state label", () => {
    const result = summarizeLiveBar(
      buildEvent({
        map_slug: "mirage",
        map_phase: "live",
        bomb_state: "planted",
      }),
    );
    expect(result!.bombDisplay).toContain("planted");
  });

  it("emits bombDisplay null when bomb_state is null/undefined", () => {
    const result = summarizeLiveBar(
      buildEvent({ map_slug: "mirage", map_phase: "live" }),
    );
    expect(result!.bombDisplay).toBeNull();
  });
});

// ===========================================================================
// computeLineupUtilityFilter — PR 10's three-tier preference order
// ===========================================================================

describe("computeLineupUtilityFilter", () => {
  it("returns the override slug when set, ignoring active/held", () => {
    const result = computeLineupUtilityFilter({
      overrideSlug: "flash",
      activeUtilitySlug: "smoke",
      heldUtilitySlugs: ["smoke", "grenade"],
    });
    expect(result).toEqual(["flash"]);
  });

  it("returns the active slug when no override, ignoring held", () => {
    const result = computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: "smoke",
      heldUtilitySlugs: ["smoke", "grenade"],
    });
    expect(result).toEqual(["smoke"]);
  });

  it("returns held slugs when no override and no active", () => {
    const result = computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: null,
      heldUtilitySlugs: ["smoke", "flash"],
    });
    expect(result).toEqual(["smoke", "flash"]);
  });

  it("returns null when no override, no active, and no held", () => {
    const result = computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: null,
      heldUtilitySlugs: [],
    });
    expect(result).toBeNull();
  });

  it("returns null when all inputs are null", () => {
    const result = computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: null,
      heldUtilitySlugs: null,
    });
    expect(result).toBeNull();
  });

  it("treats undefined inputs like null (defensive for GSI passthrough)", () => {
    const result = computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: undefined,
      heldUtilitySlugs: undefined,
    });
    expect(result).toBeNull();
  });

  it("does not mutate the original held array", () => {
    const held = ["smoke", "flash"];
    computeLineupUtilityFilter({
      overrideSlug: null,
      activeUtilitySlug: null,
      heldUtilitySlugs: held,
    });
    expect(held).toEqual(["smoke", "flash"]);
  });
});
