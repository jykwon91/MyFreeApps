/**
 * Tests for hooks/useZoneEditorDraft.
 *
 * Covers the contracts the design review called out as load-bearing:
 *  - Draft initializes from server zones on first hydrate.
 *  - localStorage round-trip survives unmount/remount.
 *  - Stale draft (matches server) is silently cleared, not flagged as restored.
 *  - Dirty calc against baseline + per-slug dirtySlugs.
 *  - Undo/redo invariants.
 *  - discardChanges restores baseline + clears localStorage.
 *  - markSaved updates baseline so isDirty becomes false.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useZoneEditorDraft } from "@/hooks/useZoneEditorDraft";
import type { MapZone } from "@/types/game";

const MAP_ID = "11111111-1111-1111-1111-111111111111";

function makeServerZones(): MapZone[] {
  return [
    { id: "z1", slug: "a-site", name: "A Site", polygon_points: [] },
    { id: "z2", slug: "b-site", name: "B Site", polygon_points: [] },
    {
      id: "z3",
      slug: "mid",
      name: "Mid",
      polygon_points: [
        { x: 0.4, y: 0.4 },
        { x: 0.6, y: 0.4 },
        { x: 0.5, y: 0.6 },
      ],
    },
  ];
}

beforeEach(() => {
  localStorage.clear();
});

describe("useZoneEditorDraft — initialization", () => {
  it("is not ready until both mapId and serverZones arrive", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: undefined, serverZones: undefined }),
    );
    expect(result.current.ready).toBe(false);
  });

  it("hydrates from server zones when no stored draft exists", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    expect(result.current.ready).toBe(true);
    expect(result.current.getPolygon("mid")).toEqual([
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.5, y: 0.6 },
    ]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.restoredFromStorage).toBe(false);
  });

  it("ignores a stored draft that matches the server (no diff)", () => {
    const server = makeServerZones();
    localStorage.setItem(
      `mga_zone_draft_${MAP_ID}`,
      JSON.stringify({
        __version: 1,
        mapId: MAP_ID,
        zones: {
          "a-site": [],
          "b-site": [],
          mid: [
            { x: 0.4, y: 0.4 },
            { x: 0.6, y: 0.4 },
            { x: 0.5, y: 0.6 },
          ],
        },
      }),
    );
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: server }),
    );
    expect(result.current.restoredFromStorage).toBe(false);
    // Storage was cleared because draft matched server.
    expect(localStorage.getItem(`mga_zone_draft_${MAP_ID}`)).toBeNull();
  });

  it("restores a meaningfully-different stored draft and flags it", () => {
    localStorage.setItem(
      `mga_zone_draft_${MAP_ID}`,
      JSON.stringify({
        __version: 1,
        mapId: MAP_ID,
        zones: {
          "a-site": [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.1 },
            { x: 0.2, y: 0.2 },
          ],
          "b-site": [],
          mid: [
            { x: 0.4, y: 0.4 },
            { x: 0.6, y: 0.4 },
            { x: 0.5, y: 0.6 },
          ],
        },
      }),
    );
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    expect(result.current.restoredFromStorage).toBe(true);
    expect(result.current.getPolygon("a-site")).toHaveLength(3);
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtySlugs.has("a-site")).toBe(true);
    expect(result.current.dirtySlugs.has("mid")).toBe(false);
  });

  it("ignores a stored draft from a different map_id", () => {
    localStorage.setItem(
      `mga_zone_draft_${MAP_ID}`,
      JSON.stringify({
        __version: 1,
        mapId: "different-map",
        zones: { "a-site": [{ x: 0.5, y: 0.5 }] },
      }),
    );
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    expect(result.current.restoredFromStorage).toBe(false);
    expect(result.current.getPolygon("a-site")).toEqual([]);
  });

  it("ignores a stored draft from an old __version", () => {
    localStorage.setItem(
      `mga_zone_draft_${MAP_ID}`,
      JSON.stringify({
        __version: 0,
        mapId: MAP_ID,
        zones: { "a-site": [{ x: 0.5, y: 0.5 }] },
      }),
    );
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    expect(result.current.restoredFromStorage).toBe(false);
    expect(result.current.getPolygon("a-site")).toEqual([]);
  });
});

describe("useZoneEditorDraft — editing", () => {
  it("setPolygon updates the zone + flags it dirty", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    act(() =>
      result.current.setPolygon("a-site", [
        { x: 0.7, y: 0.3 },
        { x: 0.9, y: 0.3 },
        { x: 0.9, y: 0.5 },
      ]),
    );
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtySlugs.has("a-site")).toBe(true);
    expect(result.current.getPolygon("a-site")).toHaveLength(3);
  });

  it("clearPolygon empties the zone polygon", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    expect(result.current.getPolygon("mid")).toHaveLength(3);
    act(() => result.current.clearPolygon("mid"));
    expect(result.current.getPolygon("mid")).toEqual([]);
    expect(result.current.dirtySlugs.has("mid")).toBe(true);
  });

  it("persists changes to localStorage", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    act(() =>
      result.current.setPolygon("a-site", [
        { x: 0.7, y: 0.3 },
        { x: 0.9, y: 0.3 },
        { x: 0.9, y: 0.5 },
      ]),
    );
    const stored = JSON.parse(
      localStorage.getItem(`mga_zone_draft_${MAP_ID}`) ?? "{}",
    );
    expect(stored.mapId).toBe(MAP_ID);
    expect(stored.zones["a-site"]).toHaveLength(3);
  });

  it("clears localStorage when draft returns to baseline", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    const triangle = [
      { x: 0.7, y: 0.3 },
      { x: 0.9, y: 0.3 },
      { x: 0.9, y: 0.5 },
    ];
    act(() => result.current.setPolygon("a-site", triangle));
    expect(localStorage.getItem(`mga_zone_draft_${MAP_ID}`)).not.toBeNull();
    act(() => result.current.clearPolygon("a-site"));
    // a-site is now [] which matches the server baseline of [].
    expect(localStorage.getItem(`mga_zone_draft_${MAP_ID}`)).toBeNull();
  });
});

describe("useZoneEditorDraft — undo / redo", () => {
  it("undo reverts last change; redo replays it", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    expect(result.current.canUndo).toBe(false);
    const triangle = [
      { x: 0.7, y: 0.3 },
      { x: 0.9, y: 0.3 },
      { x: 0.9, y: 0.5 },
    ];
    act(() => result.current.setPolygon("a-site", triangle));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.getPolygon("a-site")).toHaveLength(3);

    act(() => result.current.undo());
    expect(result.current.getPolygon("a-site")).toEqual([]);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.getPolygon("a-site")).toHaveLength(3);
  });

  it("new edit clears the redo stack", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    act(() =>
      result.current.setPolygon("a-site", [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ]),
    );
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() =>
      result.current.setPolygon("b-site", [
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 },
        { x: 0.6, y: 0.6 },
      ]),
    );
    expect(result.current.canRedo).toBe(false);
  });
});

describe("useZoneEditorDraft — discardChanges / markSaved", () => {
  it("discardChanges resets to baseline and clears storage", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    act(() =>
      result.current.setPolygon("a-site", [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ]),
    );
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.discardChanges());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.getPolygon("a-site")).toEqual([]);
    expect(localStorage.getItem(`mga_zone_draft_${MAP_ID}`)).toBeNull();
  });

  it("markSaved promotes draft to baseline (isDirty -> false)", () => {
    const { result } = renderHook(() =>
      useZoneEditorDraft({ mapId: MAP_ID, serverZones: makeServerZones() }),
    );
    act(() =>
      result.current.setPolygon("a-site", [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ]),
    );
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.markSaved());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.getPolygon("a-site")).toHaveLength(3);
    expect(localStorage.getItem(`mga_zone_draft_${MAP_ID}`)).toBeNull();
  });
});
