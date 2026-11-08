import { describe, expect, it } from "vitest";
import legacyJson from "@/games/wow-forever/data/legacy/legacy.json";
import { decodeLegacy } from "@/games/wow-forever/lib/legacy/decodeLegacy";
import { categoryTicks, earnedPoints } from "@/games/wow-forever/lib/legacy/legacyChallengeCounts";
import { decodeLegacyPlan, encodeLegacyPlan } from "@/games/wow-forever/lib/legacy/legacyPlanCode";
import {
  addBlock,
  addRank,
  emptyPlan,
  isLegalPlan,
  isNodeOpen,
  removeBlock,
  removeRank,
  totalSpent,
  treeSpent,
} from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyDataFile } from "@/games/wow-forever/types/legacy/legacyDataFile";
import type { LegacyPlan } from "@/games/wow-forever/types/legacy/legacyPlan";

const data = decodeLegacy(legacyJson as unknown as LegacyDataFile);
const { trees, cap } = data;

const PROFESSIONS = 0;
const ADVENTURE = 1;
const RESOURCEFULNESS = 2;

function nodeIndex(tree: number, name: string): number {
  const i = trees[tree].nodes.findIndex((n) => n.name === name);
  if (i < 0) throw new Error(`no node ${name}`);
  return i;
}

const OVERTIME = nodeIndex(PROFESSIONS, "Working Overtime");
const HARVEST = nodeIndex(PROFESSIONS, "Bountiful Harvest");
const CHEF = nodeIndex(PROFESSIONS, "Master Chef");
const STUDY = nodeIndex(PROFESSIONS, "Dedicated Study");

function spend(plan: LegacyPlan, tree: number, node: number, times: number): LegacyPlan {
  let next = plan;
  for (let i = 0; i < times; i += 1) next = addRank(trees, next, cap, tree, node);
  return next;
}

describe("legacy data", () => {
  it("has three trees of nine nodes, a 16-point cap and the rank track", () => {
    expect(trees.map((t) => t.name)).toEqual(["Professions", "Adventure", "Resourcefulness"]);
    expect(trees.every((t) => t.nodes.length === 9)).toBe(true);
    expect(cap).toBe(16);
    expect(data.rankMax).toBe(90);
    expect(data.rewards.map((r) => r.rank)).toEqual([15, 25, 40, 55]);
    expect(data.challengeIds).toHaveLength(65);
    expect(new Set(data.challengeIds).size).toBe(65);
  });

  it("only draws edges between nodes of the same tree", () => {
    for (const tree of trees) {
      const ids = new Set(tree.nodes.map((n) => n.id));
      expect(tree.edges.every(([from, to]) => ids.has(from) && ids.has(to))).toBe(true);
    }
  });
});

describe("legacy rules", () => {
  it("starts empty with every ungated node open", () => {
    const plan = emptyPlan(trees);
    expect(totalSpent(plan)).toBe(0);
    expect(isNodeOpen(trees[PROFESSIONS], plan[PROFESSIONS], OVERTIME)).toBe(true);
    expect(isNodeOpen(trees[PROFESSIONS], plan[PROFESSIONS], CHEF)).toBe(false);
  });

  it("opens the 5 gate after 5 points in the tree and says how many more until then", () => {
    let plan = spend(emptyPlan(trees), PROFESSIONS, OVERTIME, 3);
    expect(addBlock(trees, plan, cap, PROFESSIONS, CHEF)).toBe("Spend 5 points in Professions to unlock (2 more).");
    expect(addRank(trees, plan, cap, PROFESSIONS, CHEF)).toBe(plan);
    plan = spend(plan, PROFESSIONS, OVERTIME, 2);
    expect(addBlock(trees, plan, cap, PROFESSIONS, CHEF)).toBeNull();
  });

  it("opens the 10 gate from points in the open and 5-gate nodes", () => {
    let plan = spend(emptyPlan(trees), PROFESSIONS, OVERTIME, 5);
    plan = spend(plan, PROFESSIONS, CHEF, 2);
    expect(addBlock(trees, plan, cap, PROFESSIONS, STUDY)).toBe("Spend 10 points in Professions to unlock (3 more).");
    plan = spend(plan, PROFESSIONS, CHEF, 3);
    expect(treeSpent(plan[PROFESSIONS])).toBe(10);
    expect(addBlock(trees, plan, cap, PROFESSIONS, STUDY)).toBeNull();
    expect(removeBlock(trees, spend(plan, PROFESSIONS, STUDY, 1), cap, PROFESSIONS, CHEF)).toBe(
      "Talents further along Professions need this point.",
    );
  });

  it("stops at a node's highest rank", () => {
    const plan = spend(emptyPlan(trees), PROFESSIONS, OVERTIME, 7);
    expect(plan[PROFESSIONS][OVERTIME]).toBe(5);
    expect(addBlock(trees, plan, cap, PROFESSIONS, OVERTIME)).toBe("Already at its highest rank.");
  });

  it("never puts a point in a node the game files mark for a future update", () => {
    const later = trees[PROFESSIONS].nodes.findIndex((n) => n.comingLater);
    expect(addBlock(trees, emptyPlan(trees), cap, PROFESSIONS, later)).toBe("Coming in a future update.");
  });

  it("stops at the 16-point cap", () => {
    let plan = spend(emptyPlan(trees), PROFESSIONS, OVERTIME, 5);
    plan = spend(plan, PROFESSIONS, HARVEST, 5);
    plan = spend(plan, ADVENTURE, nodeIndex(ADVENTURE, "Well Rested"), 5);
    plan = spend(plan, RESOURCEFULNESS, nodeIndex(RESOURCEFULNESS, "Reinforce"), 5);
    expect(totalSpent(plan)).toBe(cap);
    expect(addBlock(trees, plan, cap, PROFESSIONS, STUDY)).toBe("All 16 points are spent.");
  });

  it("won't take out a point a gated node depends on", () => {
    let plan = spend(emptyPlan(trees), PROFESSIONS, OVERTIME, 5);
    plan = spend(plan, PROFESSIONS, CHEF, 1);
    expect(removeBlock(trees, plan, cap, PROFESSIONS, OVERTIME)).toBe(
      "Talents further along Professions need this point.",
    );
    expect(removeRank(trees, plan, cap, PROFESSIONS, OVERTIME)).toBe(plan);
    plan = removeRank(trees, plan, cap, PROFESSIONS, CHEF);
    expect(plan[PROFESSIONS][CHEF]).toBe(0);
    expect(removeBlock(trees, plan, cap, PROFESSIONS, OVERTIME)).toBeNull();
    expect(removeBlock(trees, plan, cap, PROFESSIONS, HARVEST)).toBe("No points spent here.");
  });

  it("rejects plans no character could have", () => {
    const over = emptyPlan(trees).map((ranks) => [...ranks]);
    over[PROFESSIONS][CHEF] = 1;
    expect(isLegalPlan(trees, over, cap)).toBe(false);
    const tooHigh = emptyPlan(trees).map((ranks) => [...ranks]);
    tooHigh[PROFESSIONS][OVERTIME] = 6;
    expect(isLegalPlan(trees, tooHigh, cap)).toBe(false);
    expect(isLegalPlan(trees, emptyPlan(trees).slice(0, 2), cap)).toBe(false);
  });
});

describe("legacy plan link", () => {
  it("is empty for an empty plan and round-trips a real one", () => {
    expect(encodeLegacyPlan(emptyPlan(trees))).toBe("");
    let plan = spend(emptyPlan(trees), PROFESSIONS, OVERTIME, 5);
    plan = spend(plan, PROFESSIONS, CHEF, 2);
    plan = spend(plan, RESOURCEFULNESS, nodeIndex(RESOURCEFULNESS, "Reinforce"), 3);
    const code = encodeLegacyPlan(plan);
    expect(code).toBe("1-502--003");
    expect(decodeLegacyPlan(code, trees, cap)).toEqual(plan);
  });

  it.each([
    ["wrong version", "2-5--"],
    ["too few trees", "1-5-"],
    ["letters", "1-5a--"],
    ["longer than the tree", "1-5000000000--"],
    ["a gate not met", "1-001--"],
    ["over a node's max", "1-6--"],
    ["over the cap", "1-55-55-"],
    ["far too long", `1-${"0".repeat(80)}--`],
  ])("rejects %s", (_label, code) => {
    expect(decodeLegacyPlan(code, trees, cap)).toBeNull();
  });
});

describe("legacy challenges", () => {
  it("counts ticked points for the account and per category", () => {
    const first = data.categories[0];
    const challenge = first.groups[0].challenges[0];
    const ticked = new Set([challenge.id, "not-a-challenge"]);
    expect(earnedPoints(data.categories, ticked)).toBe(challenge.points);
    const [done, total] = categoryTicks(first, ticked);
    expect(done).toBe(1);
    expect(total).toBeGreaterThan(0);
    expect(earnedPoints(data.categories, new Set())).toBe(0);
  });
});
