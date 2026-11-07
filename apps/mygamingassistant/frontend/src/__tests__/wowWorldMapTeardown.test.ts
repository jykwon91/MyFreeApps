import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as LeafletMap } from "leaflet";
import { removeMapWhenStill } from "@/games/wow-forever/lib/leaflet/removeMapWhenStill";

/** Just enough of a Leaflet map: listeners, `fire` and a counted `remove`. */
function stubMap() {
  const handlers = new Map<string, Array<() => void>>();
  const stub = {
    removed: 0,
    on: (name: string, h: () => void) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
    off: (name: string, h: () => void) => handlers.set(name, (handlers.get(name) ?? []).filter((x) => x !== h)),
    remove: () => {
      stub.removed += 1;
    },
    fire: (name: string) => (handlers.get(name) ?? []).forEach((h) => h()),
    listeners: (name: string) => (handlers.get(name) ?? []).length,
  };
  return stub;
}

describe("World Map teardown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("takes a still map down straight away", () => {
    const map = stubMap();
    removeMapWhenStill(map as unknown as LeafletMap, false, 500);
    expect(map.removed).toBe(1);
  });

  it("waits for a zoom under way to land, then takes the map down once", () => {
    const map = stubMap();
    removeMapWhenStill(map as unknown as LeafletMap, true, 500);
    expect(map.removed).toBe(0);

    map.fire("zoomend");
    // Not inside the zoomend handlers: Leaflet fires moveend on the same map right after.
    expect(map.removed).toBe(0);
    vi.advanceTimersByTime(0);
    expect(map.removed).toBe(1);
    expect(map.listeners("zoomend")).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(map.removed).toBe(1);
  });

  it("takes the map down anyway if the zoom never lands", () => {
    const map = stubMap();
    removeMapWhenStill(map as unknown as LeafletMap, true, 500);
    vi.advanceTimersByTime(499);
    expect(map.removed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(map.removed).toBe(1);

    map.fire("zoomend");
    vi.advanceTimersByTime(0);
    expect(map.removed).toBe(1);
  });
});
