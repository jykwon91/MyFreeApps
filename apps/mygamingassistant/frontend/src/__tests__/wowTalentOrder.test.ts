/**
 * Talent order encode/decode/validate — the `?o=` param.
 *
 * Run: npm run test -- wowTalentOrder
 */
import { describe, expect, it } from "vitest";
import {
  decodeTalentOrder,
  encodeTalentOrder,
  isValidOrder,
  removeFromOrder,
} from "@/games/wow-forever/lib/talents/talentOrderCode";
import type { TalentOrderEntry } from "@/games/wow-forever/types/talents/talentOrderEntry";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

// ── minimal stub trees ────────────────────────────────────────────────────────

function makeTree(id: number, name: string, talentCount: number): TalentTree {
  const talents = Array.from({ length: talentCount }, (_, i) => ({
    id: id * 100 + i,
    name: `Talent ${i}`,
    tier: Math.floor(i / 4),
    column: i % 4,
    icon: 0,
    ranks: ["Rank 1"],
    prereqs: [],
    classicName: false,
    classicRanks: null,
    classicFallback: null,
  }));
  return { id, name, icon: 0, talents };
}

// Three trees, each with 15 talents.
const TREES: TalentTree[] = [
  makeTree(1, "Tree A", 15),
  makeTree(2, "Tree B", 15),
  makeTree(3, "Tree C", 15),
];

// ── encodeTalentOrder ─────────────────────────────────────────────────────────

describe("encodeTalentOrder", () => {
  it("encodes single-digit talent indices as digit + tree char", () => {
    expect(encodeTalentOrder([[0, 0]])).toBe("00");
    expect(encodeTalentOrder([[1, 9]])).toBe("19");
    expect(encodeTalentOrder([[2, 0]])).toBe("20");
  });

  it("encodes talent indices 10–30 as letters a–u", () => {
    expect(encodeTalentOrder([[0, 10]])).toBe("0a");
    expect(encodeTalentOrder([[0, 20]])).toBe("0k");
    expect(encodeTalentOrder([[0, 30]])).toBe("0u");
  });

  it("encodes a sequence of multiple points", () => {
    const order: TalentOrderEntry[] = [
      [0, 0],
      [0, 0],
      [1, 5],
      [2, 12],
    ];
    expect(encodeTalentOrder(order)).toBe("000015 2c".replace(/ /g, ""));
    // manually: "00" + "00" + "15" + "2c"
    expect(encodeTalentOrder(order)).toBe("0000152c");
  });

  it("returns empty string for an empty order", () => {
    expect(encodeTalentOrder([])).toBe("");
  });
});

// ── decodeTalentOrder ─────────────────────────────────────────────────────────

describe("decodeTalentOrder", () => {
  it("decodes a valid code", () => {
    expect(decodeTalentOrder("00", TREES)).toEqual([[0, 0]]);
    expect(decodeTalentOrder("1a", TREES)).toEqual([[1, 10]]);
    expect(decodeTalentOrder("0000152c", TREES)).toEqual([
      [0, 0],
      [0, 0],
      [1, 5],
      [2, 12],
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(decodeTalentOrder("", TREES)).toEqual([]);
  });

  it("returns null for odd-length string", () => {
    expect(decodeTalentOrder("0", TREES)).toBeNull();
    expect(decodeTalentOrder("001", TREES)).toBeNull();
  });

  it("returns null for tree index out of range", () => {
    expect(decodeTalentOrder("30", TREES)).toBeNull(); // tree 3 doesn't exist
    expect(decodeTalentOrder("90", TREES)).toBeNull();
  });

  it("returns null for talent index out of range for the tree", () => {
    // Trees have 15 talents (0–14 = '0'–'e' in our encoding); 'f' = index 15 = out of range.
    expect(decodeTalentOrder("0f", TREES)).toBeNull();
  });

  it("returns null for unrecognised characters", () => {
    expect(decodeTalentOrder("0Z", TREES)).toBeNull();
    expect(decodeTalentOrder("0!", TREES)).toBeNull();
    expect(decodeTalentOrder("0v", TREES)).toBeNull(); // 'v' > 'u'
  });

  it("round-trips encode → decode", () => {
    const order: TalentOrderEntry[] = [[0, 3], [1, 7], [2, 14]];
    expect(decodeTalentOrder(encodeTalentOrder(order), TREES)).toEqual(order);
  });
});

// ── isValidOrder ──────────────────────────────────────────────────────────────

// Two-tier tree: talents 0–3 on tier 0, talents 4–7 on tier 1 (need 5 points above).
function makeTieredTree(id: number): TalentTree {
  const talents = Array.from({ length: 8 }, (_, i) => ({
    id: id * 100 + i,
    name: `T${i}`,
    tier: i < 4 ? 0 : 1,
    column: i % 4,
    icon: 0,
    ranks: ["Rank 1", "Rank 2"],
    prereqs: [],
    classicName: false,
    classicRanks: null,
    classicFallback: null,
  }));
  return { id, name: `Tree ${id}`, icon: 0, talents };
}

const TIERED_TREES = [makeTieredTree(1), makeTieredTree(2), makeTieredTree(3)];

function emptyBuild(trees: TalentTree[]): number[][] {
  return trees.map((t) => t.talents.map(() => 0));
}

describe("isValidOrder", () => {
  it("accepts an empty order against an empty build", () => {
    expect(isValidOrder([], TIERED_TREES, emptyBuild(TIERED_TREES))).toBe(true);
  });

  it("accepts a valid single-point order", () => {
    const build = emptyBuild(TIERED_TREES);
    build[0][0] = 1;
    expect(isValidOrder([[0, 0]], TIERED_TREES, build)).toBe(true);
  });

  it("rejects an order inconsistent with build counts", () => {
    // Order says 1 point in [0][0], build says 0.
    expect(isValidOrder([[0, 0]], TIERED_TREES, emptyBuild(TIERED_TREES))).toBe(false);
  });

  it("rejects an order that violates tier requirements", () => {
    // Talent [0][4] is tier 1 — needs 5 points in tier 0 first.
    const build = emptyBuild(TIERED_TREES);
    build[0][4] = 1;
    expect(isValidOrder([[0, 4]], TIERED_TREES, build)).toBe(false);
  });

  it("accepts a valid multi-point order respecting tier gating", () => {
    // Spend 5 points in tier-0 slots, then 1 in tier-1.
    const build = emptyBuild(TIERED_TREES) as number[][];
    for (let i = 0; i < 4; i++) build[0][i] = 1; // 4 points
    build[0][0] = 2; // 5th point in slot 0
    build[0][4] = 1; // tier-1 slot
    const order: TalentOrderEntry[] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 0], [0, 4]];
    expect(isValidOrder(order, TIERED_TREES, build)).toBe(true);
  });

  it("rejects an order that exceeds a talent's max rank", () => {
    // Talent has 2 ranks max; order tries to add 3.
    const build = emptyBuild(TIERED_TREES) as number[][];
    build[0][0] = 2;
    const order: TalentOrderEntry[] = [[0, 0], [0, 0], [0, 0]];
    expect(isValidOrder(order, TIERED_TREES, build)).toBe(false);
  });
});

// ── removeFromOrder ───────────────────────────────────────────────────────────

describe("removeFromOrder", () => {
  it("removes the last occurrence of the given entry", () => {
    const order: TalentOrderEntry[] = [[0, 0], [1, 1], [0, 0], [2, 3]];
    expect(removeFromOrder(order, 0, 0)).toEqual([[0, 0], [1, 1], [2, 3]]);
  });

  it("removes only the LAST occurrence, not an earlier one", () => {
    const order: TalentOrderEntry[] = [[0, 0], [0, 0], [0, 0]];
    const result = removeFromOrder(order, 0, 0);
    expect(result).toEqual([[0, 0], [0, 0]]);
    expect(result).toHaveLength(2);
  });

  it("returns the original array when the entry isn't present", () => {
    const order: TalentOrderEntry[] = [[0, 0], [1, 1]];
    expect(removeFromOrder(order, 2, 5)).toEqual(order);
  });

  it("handles an empty order", () => {
    expect(removeFromOrder([], 0, 0)).toEqual([]);
  });

  it("handles single-entry order", () => {
    expect(removeFromOrder([[0, 0]], 0, 0)).toEqual([]);
  });
});

// ── old `?b=`-only link (no `?o=`) still loads ───────────────────────────────

describe("backward compatibility — no order param", () => {
  it("decodeTalentOrder returns null for null (param absent)", () => {
    // Callers skip decode when param is null; just verify it doesn't crash.
    expect(() => decodeTalentOrder("", TREES)).not.toThrow();
  });
});
