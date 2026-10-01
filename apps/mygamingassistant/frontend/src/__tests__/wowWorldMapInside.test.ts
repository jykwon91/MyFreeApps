import { describe, expect, it } from "vitest";
import { decodeWalkGraph, walkPath, type WalkGraph } from "@/games/wow-forever/worldMap/walkGraph";
import { walkLeg, walkSteps } from "@/games/wow-forever/worldMap/walkSteps";
import { insideRuns } from "@/games/wow-forever/worldMap/insideRuns";
import { encode, type TestEdge, type TestNode } from "./wowWalkFile";

const LABELS: [string, string, number, number?][] = [
  ["Moonbrook", "Westfall", 0],
  ["Defias Hideout", "Westfall", 1],
  ["Cathedral Square", "Stormwind City", 1, 1],
];

/**
 * Outside 0 -> 1, into a cave 2 -> 3 -> 4 -> 5 (going down, turning), a side
 * passage 6 off the cave, and outside ground 7 right by it.
 */
function caveGraph(): WalkGraph {
  const nodes: TestNode[] = [
    { x: 0, y: 0, z: 40, label: 0 },
    { x: 100, y: 0, z: 40, label: 0 },
    { x: 140, y: 0, z: 30, label: 1 },
    { x: 140, y: -60, z: 20, label: 1 },
    { x: 200, y: -60, z: 10, label: 1 },
    { x: 200, y: 0, z: 0, label: 1 },
    { x: 140, y: 40, z: 30, label: 1 },
    { x: 100, y: -40, z: 40, label: 0 },
  ];
  const edges: TestEdge[] = [
    [0, 1, 100],
    [1, 2, 41],
    [2, 3, 61],
    [3, 4, 61],
    [4, 5, 61],
    [2, 6, 40],
    [1, 7, 40],
  ];
  return decodeWalkGraph(encode(0, nodes, edges, LABELS));
}

describe("inside a cave", () => {
  const g = caveGraph();

  it("sketches the stretch inside, with the floor around it and only that", () => {
    const leg = walkLeg(g, 0, 5, { continent: 0, wx: 0, wy: 0 }, { continent: 0, wx: 200, wy: 0 });
    const [run] = leg?.inside ?? [];
    expect(leg?.inside).toHaveLength(1);
    expect(run.name).toBe("Defias Hideout");
    expect(run.firstStep).toBe(1);
    expect(run.steps[0].text).toMatch(/^Go into Defias Hideout/);
    expect(run.steps.length).toBeGreaterThan(1);
    expect(run.climb).toBe(-40);
    expect(run.endsInside).toBe(true);
    expect(run.startsInside).toBe(false);
    // The side passage is drawn; the ground outside isn't.
    expect(run.ground).toContainEqual(expect.objectContaining({ wx: 140, wy: 40 }));
    expect(run.ground).not.toContainEqual(expect.objectContaining({ wx: 100, wy: -40 }));
  });

  it("leaves a walk that never goes inside alone", () => {
    expect(walkLeg(g, 0, 7, { continent: 0, wx: 0, wy: 0 }, { continent: 0, wx: 100, wy: -40 })?.inside).toEqual([]);
  });

  it("skips a capital city's buildings walked through on the way", () => {
    const city = decodeWalkGraph(
      encode(
        0,
        [
          { x: 0, y: 0, z: 0, label: 0 },
          { x: 60, y: 0, z: 0, label: 2 },
          { x: 120, y: 0, z: 0, label: 2 },
          { x: 120, y: 60, z: 0, label: 0 },
          { x: 180, y: 60, z: 0, label: 0 },
        ],
        [
          [0, 1, 60],
          [1, 2, 60],
          [2, 3, 60],
          [3, 4, 60],
        ],
        LABELS,
      ),
    );
    const hops = walkPath(city, 0, 4) ?? [];
    expect(insideRuns(city, hops, walkSteps(city, hops))).toEqual([]);
  });
});
