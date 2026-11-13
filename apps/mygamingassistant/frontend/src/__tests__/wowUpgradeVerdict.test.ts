/**
 * Auction house upgrade verdict: better / worse / about the same against what is worn by weighted
 * score, its % and words, two-handers against both hands, and which items a class can't wear
 * (only a known "no").
 */
import { describe, expect, it } from "vitest";
import { canWear } from "@/games/wow-forever/gear/gearFilters";
import { equippedComparisons } from "@/games/wow-forever/lib/itemCompare/equippedComparisons";
import { formatVerdictPct } from "@/games/wow-forever/lib/itemCompare/formatVerdictPct";
import { upgradeVerdict } from "@/games/wow-forever/lib/itemCompare/upgradeVerdict";
import { verdictScoring } from "@/games/wow-forever/lib/itemCompare/verdictScoring";
import { cantUseText, scoredForText, verdictText } from "@/games/wow-forever/lib/itemCompare/verdictText";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

function item(overrides: Partial<ClientItem>): ClientItem {
  return {
    id: 1,
    name: "Test Item",
    quality: "uncommon",
    slot: "chest",
    itemType: "Cloth",
    itemLevel: 30,
    requiredLevel: 25,
    armor: null,
    weapon: null,
    stats: {},
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...overrides,
  };
}

function worn(slot: string, id: number, inventoryType: string): CharacterItem {
  return {
    slot,
    item_id: id,
    name: `Worn ${id}`,
    quality: "rare",
    item_level: 30,
    inventory_type: inventoryType,
    inventory_type_name: inventoryType,
    subclass_name: null,
    binding: null,
    armor: null,
    weapon: { damage: "1 - 2", speed: "2.00", dps: "1.0" },
    stats: [],
    enchantments: [],
    spells: [],
    set_name: null,
    requirements: [],
    durability: null,
    durability_low: false,
    description: null,
  } as CharacterItem;
}

const byStamina = (i: ClientItem): number => i.stats.stamina ?? 0;

describe("upgrade verdict", () => {
  it("is an upgrade or downgrade with the % change of the worn score", () => {
    expect(upgradeVerdict(12, 10, false)).toEqual({ kind: "upgrade", pct: 20, statsOnly: false, bothHands: false });
    expect(upgradeVerdict(5, 10, false)).toEqual({ kind: "downgrade", pct: -50, statsOnly: false, bothHands: false });
  });

  it("is about the same within 2%, with no %", () => {
    expect(upgradeVerdict(101, 100, false)).toMatchObject({ kind: "same", pct: null });
    expect(upgradeVerdict(102, 100, false).kind).toBe("upgrade");
  });

  it("gives no % against a worn item that scores nothing", () => {
    expect(upgradeVerdict(5, 0, false)).toMatchObject({ kind: "upgrade", pct: null });
    expect(upgradeVerdict(0, 0, false)).toMatchObject({ kind: "same", pct: null });
  });

  it("carries whether it is by stats only, and whether it is against both hands", () => {
    expect(upgradeVerdict(12, 10, true).statsOnly).toBe(true);
    expect(upgradeVerdict(12, 10, false, true).bothHands).toBe(true);
  });

  it("formats the % with a real minus sign, capping huge gains and losses", () => {
    expect(formatVerdictPct(12)).toBe("+12%");
    expect(formatVerdictPct(-8)).toBe("−8%");
    expect(formatVerdictPct(400)).toBe("+100%+");
    expect(formatVerdictPct(-150)).toBe("−100%");
    expect(formatVerdictPct(null)).toBe("");
    expect(verdictText(upgradeVerdict(12, 10, false))).toBe("Upgrade +20%");
    expect(verdictText(upgradeVerdict(10, 10, false))).toBe("About the same");
  });
});

describe("verdicts on the equipped comparisons", () => {
  const sword = item({ id: 10, slot: "main_hand", itemType: "Sword", stats: { stamina: 10 } });
  const shield = item({ id: 11, slot: "off_hand", itemType: "Shield", stats: { stamina: 5 } });
  const greatsword = item({ id: 12, slot: "two_hand", itemType: "Sword", stats: { stamina: 30 } });
  const hands = [worn("MAIN_HAND", 10, "WEAPONMAINHAND"), worn("OFF_HAND", 11, "SHIELD")];
  const byId = new Map([sword, shield, greatsword].map((i) => [i.id, i]));

  it("judges a two-hander once, against both hands together", () => {
    const result = equippedComparisons(greatsword, hands, byId, byStamina);
    expect(result.map((r) => (r.kind === "known" ? r.verdict : "unknown"))).toEqual([
      { kind: "upgrade", pct: 100, statsOnly: false, bothHands: true },
      null,
    ]);
  });

  it("gives a two-hander no verdict when either hand's stats are unknown", () => {
    const result = equippedComparisons(greatsword, [hands[0], worn("OFF_HAND", 999, "SHIELD")], byId, byStamina);
    expect(result[0]).toMatchObject({ kind: "known", verdict: null });
  });

  it("gives an off-hand item no verdict against a worn two-hander", () => {
    const result = equippedComparisons(shield, [worn("MAIN_HAND", 12, "TWOHWEAPON")], byId, byStamina);
    expect(result[0]).toMatchObject({ kind: "known", replacesTwoHander: true, verdict: null });
  });

  it("gives no verdicts without a scorer", () => {
    expect(equippedComparisons(sword, hands, byId)[0]).toMatchObject({ kind: "known", verdict: null });
  });
});

describe("verdict scoring and wording", () => {
  it("uses the leveling weights below 60 and names the spec at 60", () => {
    const leveling = verdictScoring("mage", "fire", 30, "b");
    expect(leveling).toMatchObject({ label: "Mage", leveling: true });
    expect(scoredForText(leveling.label, leveling.leveling)).toBe("Scored for Mage leveling (the spec counts at 60)");
    const top = verdictScoring("mage", "fire", 60, "b");
    expect(top).toMatchObject({ label: "Fire Mage", leveling: false });
    expect(scoredForText(top.label, top.leveling)).toBe("Scored for Fire Mage");
    expect(top.score(item({ stats: { intellect: 10 } }))).toBeGreaterThan(top.score(item({ stats: { strength: 10 } })));
  });

  it("words the can't-use line with the item type when known", () => {
    expect(cantUseText(30, "Hunter", "Mail")).toBe("Your level 30 Hunter can't use this (Mail).");
    expect(cantUseText(30, "Hunter", null)).toBe("Your level 30 Hunter can't use this.");
  });
});

describe("which items a class can wear", () => {
  it("follows armor proficiency, including heavy armor at 40", () => {
    expect(canWear(item({ itemType: "Plate" }), "mage", 60)).toBe(false);
    expect(canWear(item({ itemType: "Mail" }), "hunter", 39)).toBe(false);
    expect(canWear(item({ itemType: "Mail" }), "hunter", 40)).toBe(true);
  });

  it("follows weapon skills and class-only items", () => {
    expect(canWear(item({ slot: "two_hand", itemType: "Sword" }), "rogue", 60)).toBe(false);
    expect(canWear(item({ slot: "main_hand", itemType: "Dagger" }), "rogue", 60)).toBe(true);
    expect(canWear(item({ slot: "finger", itemType: null, classes: ["priest"] }), "rogue", 60)).toBe(false);
  });

  it("never says no without knowing: unknown types and slots no card covers pass unless the item names other classes", () => {
    expect(canWear(item({ slot: "main_hand", itemType: null }), "mage", 60)).toBe(true);
    expect(canWear(item({ slot: "relic", itemType: "Libram" }), "paladin", 60)).toBe(true);
    expect(canWear(item({ slot: "relic", itemType: "Libram", classes: ["paladin"] }), "druid", 60)).toBe(false);
    expect(canWear(item({ slot: "shirt", itemType: "Miscellaneous" }), "warrior", 60)).toBe(true);
    expect(canWear(item({ slot: "tabard", itemType: "Miscellaneous" }), "mage", 1)).toBe(true);
  });
});
