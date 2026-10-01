import { describe, expect, it } from "vitest";
import interiorsJson from "@/games/wow-forever/data/worldMap/classic/classicInteriors.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import { decodeWalkGraph, type WalkGraph } from "@/games/wow-forever/worldMap/walkGraph";
import {
  BOSS_ROUTE,
  decodeInteriors,
  interiorRoutes,
  reachableGround,
  ROUTE_FROM,
  type Interior,
  type InteriorsFile,
} from "@/games/wow-forever/worldMap/interiors";
import { parseRouteFrom } from "@/games/wow-forever/hooks/useInteriors";
import { encode, type TestEdge, type TestNode } from "./wowWalkFile";

const MAP = 36;
const NO_WAY = 0xffff;

/**
 * Two wings. Entrance e1 (node 0) -> 1 -> boss 1 (node 2) -> boss 2 (node 4,
 * past a locked door at x=45); entrance e2 (node 5) -> boss 3 (node 6),
 * not joined to the first wing.
 */
function dungeonGraph(): WalkGraph {
  const nodes: TestNode[] = [
    { x: 0, y: 0, z: 0, label: 0 },
    { x: 30, y: 0, z: 0, label: 0 },
    { x: 30, y: 30, z: 0, label: 0 },
    { x: 45, y: 30, z: 0, label: 0 },
    { x: 60, y: 30, z: 0, label: 0 },
    { x: 200, y: 0, z: 0, label: 1 },
    { x: 230, y: 0, z: 0, label: 1 },
  ];
  const edges: TestEdge[] = [
    [0, 1, 30],
    [1, 2, 30],
    [2, 3, 15],
    [3, 4, 15],
    [5, 6, 30],
  ];
  const hubs = [
    { key: "e1", node: 0 },
    { key: "e2", node: 5 },
    { key: "b1", node: 2 },
    { key: "b2", node: 4 },
    { key: "b3", node: 6 },
  ];
  // prettier-ignore
  const cost = [
    0, NO_WAY, 60, 90, NO_WAY,
    NO_WAY, 0, NO_WAY, NO_WAY, 30,
    60, NO_WAY, 0, 30, NO_WAY,
    90, NO_WAY, 30, 0, NO_WAY,
    NO_WAY, 30, NO_WAY, NO_WAY, 0,
  ];
  const labels: [string, string, number][] = [
    ["Mast Room", "The Deadmines", 1],
    ["Goblin Foundry", "The Deadmines", 1],
  ];
  return decodeWalkGraph(encode(MAP, nodes, edges, labels, hubs, cost, true));
}

const FILE: InteriorsFile = {
  entranceColumns: ["trigger", "x", "y", "z"],
  bossColumns: ["encounter", "name", "x", "y", "z", "spots"],
  doorColumns: ["x", "y", "z", "key"],
  instances: {
    [MAP]: {
      entrances: [
        [1, 0, 0, 0],
        [2, 200, 0, 0],
      ],
      bosses: [
        [1, "Rhahk'Zor", 30, 30, 0, 1],
        [5, "Summoned One", null, null, null, 1],
        [2, "Sneed", 60, 30, 0, 2],
        [3, "Gilnid", 230, 0, 0, 1],
        [4, "Behind The Wall", 500, 500, 0, 1],
      ],
      doors: [[45, 31, 0, "Skeleton Key"]],
    },
  },
};

function interior(): Interior {
  const found = decodeInteriors(FILE).get(MAP);
  if (!found) throw new Error("no interior");
  return found;
}

describe("dungeon interiors", () => {
  it("knows it's an instance's graph", () => {
    expect(dungeonGraph().instance).toBe(true);
  });

  it("walks to each boss from the one before, in kill order", () => {
    const routes = interiorRoutes(dungeonGraph(), interior(), 1, ROUTE_FROM.previous);
    expect(routes.map((r) => [r.boss.name, r.status])).toEqual([
      ["Rhahk'Zor", BOSS_ROUTE.route],
      ["Sneed", BOSS_ROUTE.route],
      ["Behind The Wall", BOSS_ROUTE.unreachable],
      ["Summoned One", BOSS_ROUTE.unplaced],
    ]);
    expect(routes[0].fromBoss).toBeNull();
    expect(routes[0].yards).toBeCloseTo(60);
    expect(routes[1].fromBoss?.name).toBe("Rhahk'Zor");
    expect(routes[1].yards).toBeCloseTo(30);
    expect(routes[1].path[routes[1].path.length - 1]).toMatchObject({ wx: 60, wy: 30 });
  });

  it("walks every boss from the entrance when asked", () => {
    const [first, second] = interiorRoutes(dungeonGraph(), interior(), 1, ROUTE_FROM.entrance);
    expect(first.fromBoss).toBeNull();
    expect(second.fromBoss).toBeNull();
    expect(second.yards).toBeCloseTo(90);
  });

  it("lists a boss only under the entrance it's reached from", () => {
    const routes = interiorRoutes(dungeonGraph(), interior(), 2, ROUTE_FROM.previous);
    expect(routes.filter((r) => r.status === BOSS_ROUTE.route).map((r) => r.boss.name)).toEqual(["Gilnid"]);
  });

  it("flags the locked door on the step that passes it", () => {
    const sneed = interiorRoutes(dungeonGraph(), interior(), 1, ROUTE_FROM.previous)[1];
    expect(sneed.steps.filter((s) => s.door === "Skeleton Key")).toHaveLength(1);
    const rhahk = interiorRoutes(dungeonGraph(), interior(), 1, ROUTE_FROM.previous)[0];
    expect(rhahk.steps.every((s) => s.door === null)).toBe(true);
  });

  it("keeps the rare spawn count", () => {
    expect(interior().bosses.find((b) => b.name === "Sneed")?.spots).toBe(2);
  });

  it("draws only the ground the entrance reaches", () => {
    expect(reachableGround(dungeonGraph(), 1)).toHaveLength(5);
    expect(reachableGround(dungeonGraph(), 99)).toEqual([]);
  });

  it("reads the stored route start, ignoring anything else", () => {
    expect(parseRouteFrom({ from: "entrance" })).toBe(ROUTE_FROM.entrance);
    expect(parseRouteFrom({ from: "elsewhere" })).toBeNull();
    expect(parseRouteFrom("previous")).toBeNull();
  });
});

describe("the committed interiors data", () => {
  const all = decodeInteriors(interiorsJson as InteriorsFile);
  const triggers = new Set((dungeonsJson.rows as unknown[][]).map((r) => r[dungeonsJson.columns.indexOf("trigger")]));

  it("covers the Classic dungeons and raids", () => {
    expect(all.size).toBeGreaterThanOrEqual(20);
    expect(all.get(36)?.bosses.map((b) => b.name)).toContain("Edwin VanCleef");
  });

  it("enters only through entrances on the World Map", () => {
    for (const interior of all.values()) {
      for (const trigger of interior.entrances.keys()) expect(triggers).toContain(trigger);
    }
  });
});
