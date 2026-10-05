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
  TERRITORY_FACTOR,
  walkPath,
  WALK_EDGE,
  type WalkGraph,
} from "@/games/wow-forever/worldMap/walkGraph";
import { describeWalk, walkLeg } from "@/games/wow-forever/worldMap/walkSteps";
import { encode, type TestEdge, type TestNode } from "./wowWalkFile";

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
  it("keeps to the road but times the walk by the yards walked", () => {
    // 0 -> 1 -> 2 along a road (2 x 60 yd), or 0 -> 3 -> 2 across the field
    // (2 x 50 yd, costing 70 a stretch off the road).
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 60, y: 0, z: 0, label: 0 },
      { x: 120, y: 0, z: 0, label: 0 },
      { x: 60, y: 30, z: 0, label: 0 },
    ];
    const edges: TestEdge[] = [
      [0, 1, 60],
      [1, 2, 60],
      [0, 3, 70, WALK_EDGE.walk, 50],
      [3, 2, 70, WALK_EDGE.walk, 50],
    ];
    const graph = decodeWalkGraph(encode(0, nodes, edges, LABELS));
    const search = searchFrom(graph, 0);
    expect(walkPath(graph, 0, 2)?.map((h) => h.node)).toEqual([0, 1, 2]);
    expect(search.dist[2]).toBe(120);
    expect(search.yards[2]).toBe(120);
    expect(search.yards[3]).toBe(50);
  });

  it("goes around the other faction's town, but walks through its own", () => {
    // 0 -> 1 -> 2 through a Horde town (2 x 60 yd), or 0 -> 3 -> 2 around it (2 x 150 yd).
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 60, y: 0, z: 0, label: 0, hostile: 2 },
      { x: 120, y: 0, z: 0, label: 0 },
      { x: 60, y: 140, z: 0, label: 0 },
    ];
    const edges: TestEdge[] = [
      [0, 1, 60],
      [1, 2, 60],
      [0, 3, 150],
      [3, 2, 150],
    ];
    const graph = decodeWalkGraph(encode(0, nodes, edges, LABELS));
    expect(walkPath(graph, 0, 2, FACTION.alliance)?.map((h) => h.node)).toEqual([0, 3, 2]);
    expect(searchFrom(graph, 0, FACTION.alliance).yards[2]).toBe(300);
    expect(walkPath(graph, 0, 2, FACTION.horde)?.map((h) => h.node)).toEqual([0, 1, 2]);
    // Into the town itself: still a way in, the short one.
    expect(walkPath(graph, 0, 1, FACTION.alliance)?.map((h) => h.node)).toEqual([0, 1]);
  });

  it("keeps to its own side's ground, and the planner weighs the other side's yards more", () => {
    // 0 -> 1 -> 2 across a Horde home zone (2 x 60 yd), or 0 -> 3 -> 2 on open ground (2 x 150 yd).
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 60, y: 0, z: 0, label: 0, hostile: 8 },
      { x: 120, y: 0, z: 0, label: 0 },
      { x: 60, y: 140, z: 0, label: 0 },
    ];
    const edges: TestEdge[] = [
      [0, 1, 60],
      [1, 2, 60],
      [0, 3, 150],
      [3, 2, 150],
    ];
    const graph = decodeWalkGraph(encode(0, nodes, edges, LABELS));
    // Across: 120 yd x TERRITORY_FACTOR = 360 > 300 around.
    expect(walkPath(graph, 0, 2, FACTION.alliance)?.map((h) => h.node)).toEqual([0, 3, 2]);
    expect(walkPath(graph, 0, 2, FACTION.horde)?.map((h) => h.node)).toEqual([0, 1, 2]);
    // Into the zone: the yards shown are the yards walked, the effort counts them TERRITORY_FACTOR times.
    const search = searchFrom(graph, 0, FACTION.alliance);
    expect(search.yards[1]).toBe(60);
    expect(search.effort[1]).toBe(60 * TERRITORY_FACTOR);
    expect(searchFrom(graph, 0, FACTION.horde).effort[1]).toBe(60);
  });

  it("reads each faction's hub-to-hub table", () => {
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 60, y: 0, z: 0, label: 0 },
    ];
    const hubs = [
      { key: "t1", node: 0 },
      { key: "t2", node: 1 },
    ];
    const graph = decodeWalkGraph(encode(0, nodes, [[0, 1, 60]], LABELS, hubs, [0, 300, 300, 0], false, [0, 60, 60, 0]));
    expect(hubToHub(graph, "t1", "t2", FACTION.alliance)).toBe(300);
    expect(hubToHub(graph, "t1", "t2", FACTION.horde)).toBe(60);
  });

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

  it("leaves out \"through\" where the ground has no name at all", () => {
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 100, y: 0, z: 0, label: 0 },
      { x: 100, y: 0, z: 40, label: 1 },
      { x: 160, y: 0, z: 40, label: 1 },
    ];
    const edges: TestEdge[] = [[0, 1, 100], [1, 2, 70, WALK_EDGE.lift], [2, 3, 60]];
    const unnamed: [string, string, number][] = [["", "", 1], ["The Great Forge", "Ironforge", 1]];
    const graph = decodeWalkGraph(encode(0, nodes, edges, unnamed));
    const lines = describeWalk(graph, walkPath(graph, 0, 3) ?? []);
    expect(lines[0]).toMatch(/^Head north, ~100 yd$/);
    expect(lines.join("|")).not.toMatch(/through ?(,|\||$)|Go into {2}/);
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

  it("drops off a ledge one way only", () => {
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 20, label: 0 },
      { x: 40, y: 0, z: 20, label: 0 },
      { x: 45, y: 0, z: 12, label: 1 },
      { x: 85, y: 0, z: 12, label: 1 },
    ];
    const edges: TestEdge[] = [[0, 1, 40], [1, 2, 10, WALK_EDGE.drop], [2, 3, 40]];
    const g = decodeWalkGraph(encode(0, nodes, edges, CITY_LABELS));
    expect(describeWalk(g, walkPath(g, 0, 3) ?? [])).toEqual([
      "Head north, ~40 yd, through Trade District",
      "Drop down from the ledge to The Gilded Rose (no way back up)",
      "Head north, ~40 yd",
    ]);
    expect(walkPath(g, 3, 0)).toBeNull();
  });

  it("takes a one-way teleporter forward, never back", () => {
    const nodes: TestNode[] = [
      { x: 0, y: 0, z: 0, label: 0 },
      { x: 40, y: 0, z: 0, label: 0 },
      { x: 2000, y: 500, z: -150, label: 1 },
      { x: 2040, y: 500, z: -150, label: 1 },
    ];
    const edges: TestEdge[] = [[0, 1, 40], [1, 2, 35, WALK_EDGE.teleport], [2, 3, 40]];
    const g = decodeWalkGraph(encode(0, nodes, edges, CITY_LABELS));
    expect(describeWalk(g, walkPath(g, 0, 3) ?? [])).toEqual([
      "Head north, ~40 yd, through Trade District",
      "Step on the teleporter to The Gilded Rose (one way)",
      "Head north, ~40 yd",
    ]);
    expect(walkPath(g, 2, 1)).toBeNull();
    expect(g.start[g.size]).toBe(5); // two-way edges twice, the teleporter once
    // The teleporter covers no ground: 40 yd before it, 40 after.
    const end = (wx: number, wy: number) => ({ continent: 0, wx, wy });
    expect(walkLeg(g, 0, 3, end(0, 0), end(2040, 500))?.yards).toBe(80);
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
