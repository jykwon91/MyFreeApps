import { describe, expect, it } from "vitest";
import { talentBlockMessage } from "@/games/wow-forever/lib/talents/talentBlockMessage";
import { talentCellState } from "@/games/wow-forever/lib/talents/talentCellState";
import { nextTalentIndex, talentGridDirection } from "@/games/wow-forever/lib/talents/talentGridNavigation";
import { allTalentRankLines, isChangedInForever, talentRankLines } from "@/games/wow-forever/lib/talents/talentRankLines";
import {
  addBlock,
  addPoint,
  emptyBuild,
  isLegalBuild,
  minimumLevel,
  pointsForLevel,
  removeBlock,
  removePoint,
  totalPoints,
} from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import { talentTreesFixture } from "@/test/talentTreesFixture";

const TREES = talentTreesFixture();

/** Tree 0's ranks; trees 1 and 2 empty. */
function build(first: number[], second = 0, third = 0): TalentBuild {
  return [first, [second], [third]];
}

describe("points per level", () => {
  it("gives one point a level from 10, 51 at 60", () => {
    expect(pointsForLevel(10)).toBe(1);
    expect(pointsForLevel(25)).toBe(16);
    expect(pointsForLevel(60)).toBe(51);
  });

  it("clamps levels outside 10–60", () => {
    expect(pointsForLevel(1)).toBe(1);
    expect(pointsForLevel(70)).toBe(51);
  });

  it("puts the lowest level at what the points need, never below 10", () => {
    expect(minimumLevel(emptyBuild(TREES))).toBe(10);
    expect(minimumLevel(build([5, 2, 0, 0, 0]))).toBe(16);
  });
});

describe("adding a point", () => {
  it("is blocked by the level cap", () => {
    const one = build([1, 0, 0, 0, 0]);
    expect(addBlock(TREES, one, 0, 0, 10)).toEqual({ kind: "no-points" });
    expect(addBlock(TREES, one, 0, 0, 11)).toBeNull();
    expect(addPoint(TREES, one, 0, 0, 10)).toBe(one);
  });

  it("opens a row only after 5 points per row above it in the same tree", () => {
    const four = build([4, 0, 0, 0, 0], 5);
    expect(addBlock(TREES, four, 0, 2, 60)).toEqual({ kind: "tier", pointsNeeded: 1 });
    expect(addBlock(TREES, build([3, 2, 0, 0, 0]), 0, 2, 60)).toBeNull();
  });

  it("needs a prerequisite's ranks", () => {
    const partial = build([5, 5, 2, 0, 0]);
    expect(addBlock(TREES, partial, 0, 3, 60)).toEqual({ kind: "prereq", talentIndex: 2, rank: 3 });
    expect(addBlock(TREES, build([5, 5, 3, 0, 0]), 0, 3, 60)).toBeNull();
  });

  it("stops at the max rank", () => {
    expect(addBlock(TREES, build([5, 0, 0, 0, 0]), 0, 0, 60)).toEqual({ kind: "maxed" });
  });

  it("adds one point", () => {
    expect(addPoint(TREES, emptyBuild(TREES), 1, 0, 60)).toEqual(build([0, 0, 0, 0, 0], 1));
  });
});

describe("removing a point", () => {
  it("can't remove from an empty talent", () => {
    expect(removeBlock(TREES, emptyBuild(TREES), 0, 0)).toEqual({ kind: "empty" });
  });

  it("is blocked while a dependent talent needs the ranks", () => {
    const full = build([5, 5, 3, 1, 0]);
    expect(removeBlock(TREES, full, 0, 2)).toEqual({ kind: "dependent", talentIndex: 3 });
    expect(removePoint(TREES, full, 0, 2)).toBe(full);
  });

  it("is blocked when a lower row would lose its points", () => {
    expect(removeBlock(TREES, build([5, 0, 1, 0, 0]), 0, 0)).toEqual({ kind: "tier-above", tier: 1 });
    expect(removeBlock(TREES, build([5, 1, 1, 0, 0]), 0, 0)).toBeNull();
  });

  it("ignores other trees when checking rows", () => {
    expect(removeBlock(TREES, build([1, 0, 0, 0, 0], 5), 0, 0)).toBeNull();
  });

  it("takes one point out", () => {
    expect(removePoint(TREES, build([3, 0, 0, 0, 0]), 0, 0)).toEqual(build([2, 0, 0, 0, 0]));
  });
});

describe("legal builds", () => {
  it("accepts what clicking could make", () => {
    expect(isLegalBuild(TREES, build([5, 5, 3, 1, 2], 5, 5))).toBe(true);
  });

  it("rejects a rank past the max, a closed row, a missing prerequisite or the wrong shape", () => {
    expect(isLegalBuild(TREES, build([6, 0, 0, 0, 0]))).toBe(false);
    expect(isLegalBuild(TREES, build([4, 0, 1, 0, 0]))).toBe(false);
    expect(isLegalBuild(TREES, build([5, 5, 2, 1, 0]))).toBe(false);
    expect(isLegalBuild(TREES, [[0, 0, 0, 0, 0], [0]])).toBe(false);
  });

  it("rejects more than 51 points", () => {
    const big = talentTreesFixture();
    big[1] = { ...big[1], talents: Array.from({ length: 12 }, (_, i) => ({ ...big[1].talents[0], id: 200 + i })) };
    const over: TalentBuild = [[0, 0, 0, 0, 0], Array.from({ length: 12 }, () => 5), [0]];
    expect(totalPoints(over)).toBe(60);
    expect(isLegalBuild(big, over)).toBe(false);
  });
});

describe("cells, messages and keys", () => {
  it("styles a cell by its state", () => {
    const b = build([5, 2, 0, 0, 0]);
    expect(talentCellState(TREES, b, 0, 0, 60)).toBe("maxed");
    expect(talentCellState(TREES, b, 0, 1, 60)).toBe("partial");
    expect(talentCellState(TREES, b, 0, 2, 60)).toBe("open");
    expect(talentCellState(TREES, b, 0, 3, 60)).toBe("locked");
    // Out of points: still open, a higher level would take it.
    expect(talentCellState(TREES, b, 0, 2, 16)).toBe("open");
  });

  it("explains each block in words", () => {
    expect(talentBlockMessage({ kind: "tier", pointsNeeded: 1 }, TREES[0])).toBe("Needs 1 point more in First first.");
    expect(talentBlockMessage({ kind: "prereq", talentIndex: 2, rank: 3 }, TREES[0])).toBe("Needs 3 points in Talent 12 first.");
  });

  it("moves with the arrow keys within rows and to the nearest talent in the next row", () => {
    expect(talentGridDirection("ArrowDown")).toBe("down");
    expect(talentGridDirection("a")).toBeNull();
    expect(nextTalentIndex(TREES[0], 0, "right")).toBe(1);
    expect(nextTalentIndex(TREES[0], 1, "right")).toBeNull();
    expect(nextTalentIndex(TREES[0], 1, "down")).toBe(4);
    expect(nextTalentIndex(TREES[0], 4, "down")).toBe(3);
    expect(nextTalentIndex(TREES[0], 0, "up")).toBeNull();
  });

  it("shows the next rank at 0, both at a middle rank and only the current at the max", () => {
    const talent = TREES[0].talents[2];
    expect(talentRankLines(talent, 0).map((l) => l.label)).toEqual(["Rank 1"]);
    expect(talentRankLines(talent, 1).map((l) => l.label)).toEqual(["Rank 1", "Next rank (2)"]);
    expect(talentRankLines(talent, 3).map((l) => l.label)).toEqual(["Rank 3"]);
  });

  it("calls a talent changed only when a Classic text differs", () => {
    const talent = TREES[0].talents[0];
    expect(isChangedInForever(talent)).toBe(false);
    expect(isChangedInForever({ ...talent, classicRanks: [null, "Old text."] })).toBe(true);
  });

  it("pairs each rank's Forever text with Classic's where it changed", () => {
    const talent = {
      ...TREES[0].talents[2],
      ranks: ["Forever rank 1.", "Forever rank 2.", "Forever rank 3."],
      classicRanks: [null, "Classic rank 2.", null],
    };
    const [have, next] = talentRankLines(talent, 1);
    expect(have).toEqual({ rank: 1, label: "Rank 1", text: "Forever rank 1.", classicText: null });
    expect(next).toEqual({ rank: 2, label: "Next rank (2)", text: "Forever rank 2.", classicText: "Classic rank 2." });
    expect(allTalentRankLines(talent).map((l) => [l.label, l.text, l.classicText])).toEqual([
      ["Rank 1", "Forever rank 1.", null],
      ["Rank 2", "Forever rank 2.", "Classic rank 2."],
      ["Rank 3", "Forever rank 3.", null],
    ]);
  });
});
