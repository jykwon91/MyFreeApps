import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { FACTION, type WorldPoint } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { FLIGHT_MODE, planDirections, STEP_KIND, type RouteEnd } from "@/games/wow-forever/worldMap/directions";
import {
  decodeWalkGraph,
  hubToHub,
  inflateWalkFile,
  searchFrom,
  snapToGraph,
  walkPath,
  WALK_EDGE,
  type WalkGraph,
} from "@/games/wow-forever/worldMap/walkGraph";
import { describeWalk } from "@/games/wow-forever/worldMap/walkSteps";

interface TestNode {
  x: number;
  y: number;
  z: number;
  label: number;
  water?: boolean;
}

type TestEdge = [a: number, b: number, cost: number, kind?: number];

/** Writes the generator's layout (`backend/scripts/wow_world_map/walk/export.py`). */
function encode(
  mapId: number,
  nodes: TestNode[],
  edges: TestEdge[],
  labels: [string, string, number, number?][],
  hubs: { key: string; node: number }[] = [],
  hubCost: number[] = [],
): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify({ labels, hubs: hubs.map((h) => h.key) }));
  const n = nodes.length;
  const m = edges.length;
  const h = hubs.length;
  const size = 24 + 9 * n + 11 * m + 4 * h + 2 * h * h + json.length;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  [..."MGWK"].forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint16(4, 1, true);
  view.setUint16(6, mapId, true);
  view.setUint32(8, n, true);
  view.setUint32(12, m, true);
  view.setUint32(16, h, true);
  view.setUint32(20, json.length, true);
  let at = 24;
  for (const key of ["x", "y", "z"] as const) {
    for (const node of nodes) {
      view.setInt16(at, node[key], true);
      at += 2;
    }
  }
  for (const node of nodes) {
    view.setUint16(at, node.label, true);
    at += 2;
  }
  for (const node of nodes) view.setUint8(at++, node.water ? 1 : 0);
  for (const e of edges) {
    view.setUint32(at, e[0], true);
    at += 4;
  }
  for (const e of edges) {
    view.setUint32(at, e[1], true);
    at += 4;
  }
  for (const e of edges) {
    view.setUint16(at, e[2], true);
    at += 2;
  }
  for (const e of edges) view.setUint8(at++, e[3] ?? WALK_EDGE.walk);
  for (const hub of hubs) {
    view.setUint32(at, hub.node, true);
    at += 4;
  }
  for (const c of hubCost) {
    view.setUint16(at, c, true);
    at += 2;
  }
  new Uint8Array(buf, at).set(json);
  return buf;
}

const LABELS: [string, string, number, number?][] = [
  ["Kharanos", "Dun Morogh", 0],
  ["The Great Forge", "Ironforge", 1, 1],
  ["", "Loch Modan", 0],
];

/**
 * Two floors on top of each other (z 0 and z 40) joined by a lift at x=100,
 * and a lake: 0 -> 1 -> 2 (lift) -> 3 -> 4 indoors, 1 -> 5 (water) -> 6.
 */
function towerGraph(): WalkGraph {
  const nodes: TestNode[] = [
    { x: 0, y: 0, z: 0, label: 0 },
    { x: 100, y: 0, z: 0, label: 0 },
    { x: 100, y: 0, z: 40, label: 1 },
    { x: 130, y: 0, z: 40, label: 1 },
    { x: 160, y: 0, z: 40, label: 1 },
    { x: 100, y: 80, z: -2, label: 2, water: true },
    { x: 100, y: 160, z: 0, label: 2 },
  ];
  const edges: TestEdge[] = [
    [0, 1, 100],
    [1, 2, 70, WALK_EDGE.lift],
    [2, 3, 30],
    [3, 4, 30],
    [1, 5, 120],
    [5, 6, 120],
  ];
  const hubs = [
    { key: "t2", node: 0 },
    { key: "s10.0", node: 4 },
  ];
  return decodeWalkGraph(encode(0, nodes, edges, LABELS, hubs, [0, 230, 230, 0]));
}

describe("walk graph file", () => {
  it("decodes the generator's layout", () => {
    const g = towerGraph();
    expect(g.mapId).toBe(0);
    expect(g.size).toBe(7);
    expect(g.labels[1]).toEqual({ name: "The Great Forge", zone: "Ironforge", indoor: true, city: true });
    expect(Array.from(g.water)).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(hubToHub(g, "t2", "s10.0")).toBe(230);
    expect(hubToHub(g, "t2", "t999")).toBeNull();
  });

  it("links every edge both ways", () => {
    const g = towerGraph();
    const neighbours = (u: number) => Array.from(g.to.subarray(g.start[u], g.start[u + 1])).sort();
    expect(neighbours(1)).toEqual([0, 2, 5]);
    expect(neighbours(2)).toEqual([1, 3]);
  });

  it("rejects another file", () => {
    expect(() => decodeWalkGraph(new TextEncoder().encode("PNG!0000000000000000000000").buffer)).toThrow(/not a walk graph/);
  });

  it("inflates the gzipped file and passes raw bytes through", async () => {
    const raw = encode(1, [{ x: 1, y: 2, z: 3, label: 0 }], [], LABELS);
    const body = new Response(raw).body;
    if (!body) throw new Error("no body");
    const gz = await new Response(body.pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    expect(decodeWalkGraph(await inflateWalkFile(gz)).mapId).toBe(1);
    expect(decodeWalkGraph(await inflateWalkFile(raw)).size).toBe(1);
  });
});

describe("snapping to the walk graph", () => {
  const g = towerGraph();
  const at = (wx: number, wy: number, z?: number): WorldPoint => ({ continent: 0, wx, wy, z });

  it("takes the floor at the point's height", () => {
    expect(snapToGraph(g, at(100, 0, 41))).toBe(2);
    expect(snapToGraph(g, at(100, 0, 1))).toBe(1);
  });

  it("prefers ground to water next to it", () => {
    expect(snapToGraph(g, at(100, 40, 0))).toBe(1);
  });

  it("leaves a point with no ground near it off the graph", () => {
    expect(snapToGraph(g, at(2000, 2000))).toBeNull();
    expect(snapToGraph(g, { continent: 1, wx: 0, wy: 0 })).toBeNull();
  });
});

describe("walking over the graph", () => {
  const g = towerGraph();

  it("finds the cheapest way, lift included", () => {
    expect(searchFrom(g, 0).dist[4]).toBe(230);
    expect(walkPath(g, 0, 4)?.map((h) => h.node)).toEqual([0, 1, 2, 3, 4]);
    expect(walkPath(g, 0, 4)?.[2].kind).toBe(WALK_EDGE.lift);
  });

  it("returns no path between parts that don't touch", () => {
    const split = decodeWalkGraph(
      encode(0, [{ x: 0, y: 0, z: 0, label: 0 }, { x: 50, y: 0, z: 0, label: 0 }], [], LABELS),
    );
    expect(walkPath(split, 0, 1)).toBeNull();
  });

  it("tells a walk through a building with a lift", () => {
    const lines = describeWalk(g, walkPath(g, 0, 4) ?? []);
    expect(lines).toEqual([
      expect.stringMatching(/^Head north, ~100 yd, through Kharanos$/),
      "Ride the lift up to The Great Forge",
      "Head north, ~60 yd",
    ]);
  });

  it("tells a swim, and names the zone where the ground has no sub-area", () => {
    const lines = describeWalk(g, walkPath(g, 0, 6) ?? []);
    expect(lines[1]).toMatch(/^Swim west, ~80 yd across Loch Modan$/);
  });

  it("says nothing extra for a single stretch", () => {
    expect(describeWalk(g, walkPath(g, 2, 4) ?? [])).toEqual([]);
  });
});

describe("walking through a city", () => {
  const CITY_LABELS: [string, string, number, number?][] = [
    ["Trade District", "Stormwind City", 0, 1],
    ["The Gilded Rose", "Stormwind City", 1, 1],
    ["", "Elwynn Forest", 0, 0],
    ["Goldshire", "Elwynn Forest", 0, 0],
  ];
  /** North 100 yd, then west 100 yd, all on `label`. */
  function corner(label: number): WalkGraph {
    const points = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100]];
    const nodes = points.map(([x, y]) => ({ x, y, z: 0, label }));
    const edges: TestEdge[] = [[0, 1, 50], [1, 2, 50], [2, 3, 50], [3, 4, 50]];
    return decodeWalkGraph(encode(0, nodes, edges, CITY_LABELS));
  }

  it("goes turn by turn in a capital city", () => {
    const g = corner(0);
    expect(describeWalk(g, walkPath(g, 0, 4) ?? [])).toEqual([
      "Head north, ~100 yd, through Trade District",
      "Turn left and head west, ~100 yd",
    ]);
  });

  it("keeps one line for the same walk out in the open", () => {
    const g = corner(2);
    expect(describeWalk(g, walkPath(g, 0, 4) ?? [])).toEqual([]);
  });

  it("calls a short portal inside a building a teleporter", () => {
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 40, y: 0, z: 0, label: 0 },
      { x: 40, y: 0, z: 30, label: 1 },
      { x: 80, y: 0, z: 30, label: 1 },
    ];
    const edges: TestEdge[] = [[0, 1, 40], [1, 2, 5, WALK_EDGE.portal], [2, 3, 40]];
    const g = decodeWalkGraph(encode(0, nodes, edges, CITY_LABELS));
    expect(describeWalk(g, walkPath(g, 0, 3) ?? [])).toEqual([
      "Head north, ~40 yd, through Trade District",
      "Step on the teleporter up to The Gilded Rose",
      "Head north, ~40 yd",
    ]);
  });

  it("doesn't name a short patch of another area crossed on the way", () => {
    // Goldshire, a 60 yd scrap of plain Elwynn Forest, Goldshire again.
    const points: [number, number][] = [[0, 3], [100, 3], [160, 2], [220, 3], [320, 3]];
    const nodes = points.map(([x, label]) => ({ x, y: 0, z: 0, label }));
    const edges: TestEdge[] = [[0, 1, 100], [1, 2, 60], [2, 3, 60], [3, 4, 100]];
    const g = decodeWalkGraph(encode(0, nodes, edges, CITY_LABELS));
    expect(describeWalk(g, walkPath(g, 0, 4) ?? [])).toEqual([]);
  });
});

describe("directions over a walk graph", () => {
  const data = decodeWorldMap({
    zones: zonesJson,
    travel: travelJson,
    services: servicesJson,
    quests: questsJson,
    dungeons: dungeonsJson,
    masks: masksJson,
  });
  const noFlights = { flights: FLIGHT_MODE.none, knownFlightIds: new Set<number>() };
  const place = { label: "", zoneId: 1429, zoneName: "Elwynn Forest", subzone: "", x: 0, y: 0 };
  const end = (label: string, wx: number, wy: number): RouteEnd => ({
    place: { ...place, label },
    world: { continent: 0, wx, wy },
  });
  // Around Goldshire: a detour east around a pond.
  const a = end("the start", -9460, 60);
  const b = end("the goal", -9300, 60);
  const nodes: TestNode[] = [
    { x: -9460, y: 60, z: 57, label: 0 },
    { x: -9380, y: -20, z: 57, label: 0 },
    { x: -9300, y: 60, z: 57, label: 0 },
  ];

  it("follows the ground and draws its path", () => {
    const g = decodeWalkGraph(encode(0, nodes, [[0, 1, 113], [1, 2, 113]], LABELS));
    const d = planDirections(a, b, FACTION.alliance, data, noFlights, new Map([[0, g]]));
    const step = d?.steps[0];
    expect(step?.kind).toBe(STEP_KIND.walk);
    expect(step?.text).toMatch(/^Walk ~250 yd to the goal/);
    expect(step?.path?.map((p) => [p.wx, p.wy])).toEqual([
      [-9460, 60],
      [-9460, 60],
      [-9380, -20],
      [-9300, 60],
      [-9300, 60],
    ]);
    expect(d?.straightWalks).toBe(false);
  });

  it("falls back to a straight line where the graph can't join the ends", () => {
    const g = decodeWalkGraph(encode(0, nodes, [[0, 1, 113]], LABELS));
    const d = planDirections(a, b, FACTION.alliance, data, noFlights, new Map([[0, g]]));
    expect(d?.steps[0].text).toMatch(/^Head north, ~150 yd, to the goal/);
    expect(d?.steps[0].path).toBeUndefined();
    expect(d?.straightWalks).toBe(true);
  });

  it("walks straight when no graph is loaded", () => {
    const d = planDirections(a, b, FACTION.alliance, data, noFlights);
    expect(d?.steps[0].text).toMatch(/^Head north/);
    expect(d?.straightWalks).toBe(true);
  });
});
