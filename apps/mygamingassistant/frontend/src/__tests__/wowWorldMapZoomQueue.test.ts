import { describe, expect, it } from "vitest";
import type { Map as LeafletMap } from "leaflet";
import { attachZoomQueue } from "@/games/wow-forever/lib/leaflet/attachZoomQueue";

type Handler = (e: { zoom: number }) => void;

/**
 * Just enough of a Leaflet map: a zoom animates (zoomanim now, zoomend when
 * `finish()` is called) and, like Leaflet, a zoom or view asked for mid-animation
 * is ignored.
 */
function animatedMap() {
  const handlers = new Map<string, Handler[]>();
  let zoom = 0;
  let animating = false;
  const calls: string[] = [];
  const fire = (name: string, e = { zoom }) => (handlers.get(name) ?? []).forEach((h) => h(e));
  const go = (to: number, call: string) => {
    calls.push(call);
    if (animating) return;
    animating = true;
    zoom = to;
    fire("zoomanim", { zoom: to });
  };
  const map = {
    on: (name: string, h: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
    off: (name: string, h: Handler) => handlers.set(name, (handlers.get(name) ?? []).filter((x) => x !== h)),
    getZoom: () => zoom,
    getMinZoom: () => -1,
    getMaxZoom: () => 1,
    setZoom: (to: number) => go(to, `zoom ${to}`),
    setZoomAround: (_at: unknown, to: number) => go(to, `around ${to}`),
    setView: (_c: unknown, to: number) => go(to, `view ${to}`),
  };
  return {
    map: map as unknown as LeafletMap,
    calls,
    finish() {
      animating = false;
      fire("zoomend");
    },
  };
}

describe("World Map zoom queue", () => {
  it("adds up quick + presses instead of losing the ones made mid-animation", () => {
    const { map, calls, finish } = animatedMap();
    const queue = attachZoomQueue(map);
    queue.zoomTo(queue.target() + 0.5);
    queue.zoomTo(queue.target() + 0.5);
    expect(queue.target()).toBe(1);
    expect(queue.busy()).toBe(true);
    finish();
    finish();
    expect(calls).toEqual(["zoom 0.5", "zoom 1"]);
    expect(map.getZoom()).toBe(1);
    expect(queue.busy()).toBe(false);
  });

  it("keeps only the newest request while a zoom runs, and stays in range", () => {
    const { map, calls, finish } = animatedMap();
    const queue = attachZoomQueue(map);
    queue.zoomTo(0.5);
    queue.viewTo([0, 0], 5);
    queue.viewTo([0, 0], -0.5);
    finish();
    finish();
    expect(calls).toEqual(["zoom 0.5", "view -0.5"]);
  });

  it("a view asked for during someone else's zoom (show on map, a pinch) waits for it", () => {
    const { map, calls, finish } = animatedMap();
    const queue = attachZoomQueue(map);
    map.setZoom(0.8);
    queue.viewTo([0, 0], 0);
    expect(calls).toEqual(["zoom 0.8"]);
    finish();
    expect(calls).toEqual(["zoom 0.8", "view 0"]);
  });

  it("does nothing for a zoom it's already at, and stops listening once detached", () => {
    const { map, calls, finish } = animatedMap();
    const queue = attachZoomQueue(map);
    queue.zoomTo(0);
    expect(calls).toEqual([]);
    queue.zoomTo(0.5);
    queue.zoomTo(1);
    queue.detach();
    finish();
    expect(calls).toEqual(["zoom 0.5"]);
  });
});
