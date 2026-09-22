import { describe, expect, it } from "vitest";
import { LEVELING_SPEC_ID, WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { PAWN_CLASSIC_WEIGHTS } from "@/games/wow-forever/data/weights/pawnClassicWeights";
import { LEVELING_WEIGHTS } from "@/games/wow-forever/data/weights/levelingWeights";
import { newCompareItem } from "@/games/wow-forever/lib/newCompareItem";
import { compareItems } from "@/games/wow-forever/scoring/compareItems";
import { resolveWeights } from "@/games/wow-forever/scoring/resolveWeights";
import { scoreItem } from "@/games/wow-forever/scoring/scoreItem";
import { slotMismatchWarning } from "@/games/wow-forever/scoring/slotGroups";
import { weaponDps } from "@/games/wow-forever/scoring/weaponDps";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";
import type { CompareSettings } from "@/games/wow-forever/types/compareSettings";

const ARMS_60: CompareSettings = { classId: "warrior", specId: "arms", bracket: "level60", currentHitPct: null };
const MAGE_60: CompareSettings = { classId: "mage", specId: "fire", bracket: "level60", currentHitPct: null };

function item(name: string, patch: Partial<CompareItem>): CompareItem {
  return { ...newCompareItem(name), ...patch };
}

describe("resolveWeights", () => {
  it("uses Pawn's Classic scale for a real spec at level 60", () => {
    const r = resolveWeights(ARMS_60);
    expect(r.source).toBe("pawn-classic");
    expect(r.weights).toBe(PAWN_CLASSIC_WEIGHTS["warrior/arms"]);
  });

  it("uses the class leveling heuristic in the leveling bracket", () => {
    const r = resolveWeights({ ...ARMS_60, bracket: "leveling" });
    expect(r.source).toBe("leveling-heuristic");
    expect(r.weights).toBe(LEVELING_WEIGHTS.warrior);
  });

  it("falls back to leveling weights with a note for Leveling (any) at 60", () => {
    const r = resolveWeights({ ...ARMS_60, specId: LEVELING_SPEC_ID });
    expect(r.source).toBe("leveling-heuristic");
    expect(r.notes[0]).toMatch(/pick a spec/i);
  });

  it("has a Pawn scale for every spec and a leveling scale for every class", () => {
    for (const cls of WOW_CLASSES) {
      expect(LEVELING_WEIGHTS[cls.id]).toBeDefined();
      for (const spec of cls.specs) expect(PAWN_CLASSIC_WEIGHTS[`${cls.id}/${spec.id}`]).toBeDefined();
    }
  });
});

describe("scoreItem", () => {
  const weights = PAWN_CLASSIC_WEIGHTS["warrior/arms"];

  it("sums stat x weight and lists unweighted stats as not scored (never 0)", () => {
    const s = scoreItem(item("A", { stats: { strength: 10, intellect: 5, hit_rating: 12 } }), {
      weights,
      role: "melee",
      currentHitPct: null,
    });
    const str = s.rows.find((r) => r.key === "strength");
    expect(str?.points).toBeCloseTo(10 * (weights.stats.strength ?? 0), 2);
    for (const key of ["intellect", "hit_rating"] as const) {
      const row = s.rows.find((r) => r.key === key);
      expect(row?.weight).toBeNull();
      expect(row?.points).toBeNull();
    }
    expect(s.total).toBeCloseTo(str?.points ?? 0, 2);
  });

  it("only counts hit up to the cap when the user gives their current hit", () => {
    const hitItem = item("Hit", { stats: { hit_pct: 2 } });
    const full = scoreItem(hitItem, { weights, role: "melee", currentHitPct: null });
    const capped = scoreItem(hitItem, { weights, role: "melee", currentHitPct: 8 });
    const row = capped.rows.find((r) => r.key === "hit_pct");
    expect(row?.countedAmount).toBe(1);
    expect(capped.total).toBeCloseTo(full.total / 2, 1);
    expect(capped.notes[0]).toMatch(/9% cap/);
  });

  it("uses the spell hit cap for casters", () => {
    const s = scoreItem(item("Spell hit", { stats: { spell_hit_pct: 3 } }), {
      weights: PAWN_CLASSIC_WEIGHTS["mage/fire"],
      role: "caster",
      currentHitPct: 15,
    });
    expect(s.rows[0].countedAmount).toBe(1);
  });

  it("scores melee weapon DPS for melee slots and ranged DPS for ranged slots", () => {
    const hunter = PAWN_CLASSIC_WEIGHTS["hunter/marksmanship"];
    const weapon = { minDamage: 50, maxDamage: 100, speed: 2.5 };
    const ctx = { weights: hunter, role: "ranged" as const, currentHitPct: null };
    const bow = scoreItem(item("Bow", { slot: "ranged", weapon }), ctx);
    const sword = scoreItem(item("Sword", { slot: "one_hand", weapon }), ctx);
    expect(bow.total).toBeCloseTo(30 * hunter.rangedWeaponDps, 2);
    expect(sword.total).toBeCloseTo(30 * hunter.meleeWeaponDps, 2);
  });
});

describe("weaponDps", () => {
  it("averages damage over speed, to one decimal", () => {
    expect(weaponDps({ minDamage: 44, maxDamage: 115, speed: 1.9 })).toBe(41.8);
    expect(weaponDps({ minDamage: 1, maxDamage: 2, speed: 0 })).toBe(0);
  });
});

describe("slotMismatchWarning", () => {
  it("allows one-hand vs main hand, and ignores unknown slots", () => {
    expect(slotMismatchWarning(["one_hand", "main_hand", null])).toBeNull();
    expect(slotMismatchWarning(["finger", "finger"])).toBeNull();
  });

  it("warns on different slots, with a two-hander message", () => {
    expect(slotMismatchWarning(["head", "chest"])).toMatch(/different slots/);
    expect(slotMismatchWarning(["two_hand", "one_hand"])).toMatch(/two-hander/i);
  });
});

describe("compareItems", () => {
  it("isn't ready until two items have something to score", () => {
    const r = compareItems([item("A", { stats: { strength: 5 } }), item("B", {})], ARMS_60);
    expect(r.ready).toBe(false);
    expect(r.winner).toBeNull();
  });

  it("ranks items, names the winner and explains why in plain English", () => {
    const a = item("Strength Helm", { slot: "head", stats: { strength: 20, stamina: 10 } });
    const b = item("Stamina Helm", { slot: "head", stats: { strength: 5, stamina: 25 } });
    const r = compareItems([b, a], ARMS_60);
    expect(r.winner?.name).toBe("Strength Helm");
    expect(r.ranked[0].pctOfBest).toBe(100);
    expect(r.why[0]).toMatch(/Strength Helm scores .* more than Stamina Helm/);
    expect(r.why.join(" ")).toMatch(/ahead mostly on Strength \(\+20 vs \+5\)/);
    expect(r.why.join(" ")).toMatch(/give up some Stamina/);
    expect(r.warnings).toEqual([]);
  });

  it("puts not-scored stats at the bottom of the breakdown", () => {
    const r = compareItems(
      [item("A", { stats: { intellect: 10, strength: 1 } }), item("B", { stats: { strength: 2 } })],
      ARMS_60,
    );
    expect(r.breakdown.map((l) => [l.key, l.scored])).toEqual([
      ["strength", true],
      ["intellect", false],
    ]);
  });

  it("reports a tie and a slot mismatch", () => {
    const r = compareItems(
      [
        item("Ring", { slot: "finger", stats: { spell_damage: 10 } }),
        item("Neck", { slot: "neck", stats: { spell_damage: 10 } }),
      ],
      MAGE_60,
    );
    expect(r.isTie).toBe(true);
    expect(r.winner).toBeNull();
    expect(r.warnings[0]).toMatch(/different slots/);
  });

  it("adds a hit-cap note only when hit is involved and current hit is unknown", () => {
    const items = [item("A", { stats: { hit_pct: 1 } }), item("B", { stats: { strength: 5 } })];
    expect(compareItems(items, ARMS_60).notes.join(" ")).toMatch(/9%/);
    expect(compareItems(items, { ...ARMS_60, currentHitPct: 3 }).notes).toEqual([]);
  });

  it("ignores boss hit caps while leveling, even with a saved hit %", () => {
    const items = [item("A", { stats: { hit_pct: 3 } }), item("B", { stats: { strength: 5 } })];
    const leveling = compareItems(items, { ...ARMS_60, bracket: "leveling", currentHitPct: 9 });
    expect(leveling.notes).toEqual([]);
    const hitRow = leveling.ranked.flatMap((r) => r.score.rows).find((row) => row.key === "hit_pct");
    expect(hitRow?.countedAmount).toBe(3);
  });
});
