/**
 * Auction house item compare: which worn slots an item is compared with, the stat / armor / DPS
 * delta, its lines (green gain, red loss), unknown stats, and the saved character slug.
 */
import { describe, expect, it } from "vitest";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { parsePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { itemsBySlot } from "@/games/wow-forever/lib/character/characterGear";
import { playerSettingsFromCharacter, settingsMatchCharacter } from "@/games/wow-forever/lib/character/characterPlayerSettings";
import { compareItems } from "@/games/wow-forever/lib/itemCompare/compareItems";
import { comparisonSlots, isEquippableSlot } from "@/games/wow-forever/lib/itemCompare/comparisonSlots";
import { deltaLines, deltaNotes, formatSignedNumber, formatSignedStat } from "@/games/wow-forever/lib/itemCompare/deltaLines";
import { equippedComparisons } from "@/games/wow-forever/lib/itemCompare/equippedComparisons";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

function clientItem(overrides: Partial<ClientItem>): ClientItem {
  return {
    id: 1,
    name: "Test Item",
    quality: "uncommon",
    slot: "head",
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

function worn(slot: string, id: number, overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    slot,
    item_id: id,
    name: `Worn ${id}`,
    quality: "rare",
    item_level: 30,
    inventory_type: slot,
    inventory_type_name: slot,
    subclass_name: null,
    binding: null,
    armor: null,
    weapon: null,
    stats: [],
    enchantments: [],
    spells: [],
    set_name: null,
    requirements: [],
    durability: null,
    durability_low: false,
    description: null,
    ...overrides,
  };
}

const WEAPON_TEXT = { damage: "10 - 20 Damage", speed: "Speed 2.00", dps: "(7.5 damage per second)" };

function slotsFor(slot: ItemSlot, ...equipped: CharacterItem[]): string[] {
  return comparisonSlots(slot, itemsBySlot(equipped)).map((c) => c.slot);
}

describe("which worn slots an item is compared with", () => {
  it("maps single slots to Blizzard's names", () => {
    expect(slotsFor("head")).toEqual(["HEAD"]);
    expect(slotsFor("back")).toEqual(["BACK"]);
    expect(slotsFor("wrist")).toEqual(["WRIST"]);
    expect(slotsFor("neck")).toEqual(["NECK"]);
  });

  it("compares a ring with both rings and a trinket with both trinkets, worn or not", () => {
    expect(slotsFor("finger")).toEqual(["FINGER_1", "FINGER_2"]);
    expect(slotsFor("trinket", worn("TRINKET_1", 5))).toEqual(["TRINKET_1", "TRINKET_2"]);
  });

  it("compares a one-hander with the main hand, and the off hand only when it holds a weapon", () => {
    expect(slotsFor("one_hand", worn("MAIN_HAND", 1))).toEqual(["MAIN_HAND"]);
    expect(slotsFor("one_hand", worn("MAIN_HAND", 1), worn("OFF_HAND", 2))).toEqual(["MAIN_HAND"]);
    expect(slotsFor("one_hand", worn("MAIN_HAND", 1), worn("OFF_HAND", 2, { weapon: WEAPON_TEXT }))).toEqual(["MAIN_HAND", "OFF_HAND"]);
  });

  it("compares a two-hander with the main hand and whatever is in the off hand", () => {
    expect(slotsFor("two_hand", worn("MAIN_HAND", 1))).toEqual(["MAIN_HAND"]);
    expect(slotsFor("two_hand", worn("MAIN_HAND", 1), worn("OFF_HAND", 2))).toEqual(["MAIN_HAND", "OFF_HAND"]);
  });

  it("compares main-hand-only weapons with the main hand, and shields and held-in-off-hand items with the off hand", () => {
    expect(slotsFor("main_hand")).toEqual(["MAIN_HAND"]);
    expect(slotsFor("off_hand")).toEqual(["OFF_HAND"]);
    expect(slotsFor("held_in_off_hand")).toEqual(["OFF_HAND"]);
  });

  it("compares ranged weapons, thrown weapons and relics with the ranged slot", () => {
    expect(slotsFor("ranged")).toEqual(["RANGED"]);
    expect(slotsFor("thrown")).toEqual(["RANGED"]);
    expect(slotsFor("relic")).toEqual(["RANGED"]);
  });

  it("has nothing to compare an item that isn't worn with", () => {
    expect(slotsFor("other")).toEqual([]);
    expect(isEquippableSlot("other")).toBe(false);
    expect(isEquippableSlot("head")).toBe(true);
  });
});

describe("what changes between two items", () => {
  it("lists gains and losses in stat-key order and leaves equal stats out", () => {
    const delta = compareItems(
      clientItem({ stats: { stamina: 20, intellect: 5, spirit: 4 } }),
      clientItem({ stats: { stamina: 8, intellect: 8, spirit: 4, fire_resistance: 6 } }),
    );
    expect(delta.stats).toEqual([
      { key: "stamina", amount: 12 },
      { key: "intellect", amount: -3 },
      { key: "fire_resistance", amount: -6 },
    ]);
    expect(delta.armor).toBe(0);
    expect(delta.dps).toBeNull();
  });

  it("counts a stat only one item has as the whole amount", () => {
    expect(compareItems(clientItem({ stats: { crit_pct: 1 } }), clientItem({})).stats).toEqual([{ key: "crit_pct", amount: 1 }]);
  });

  it("compares armor, treating none as 0", () => {
    expect(compareItems(clientItem({ armor: 80 }), clientItem({ armor: 62 })).armor).toBe(18);
    expect(compareItems(clientItem({}), clientItem({ armor: 40 })).armor).toBe(-40);
  });

  it("compares weapon damage per second to one decimal, and says nothing when either side has none", () => {
    const fast = clientItem({ slot: "main_hand", weapon: { minDamage: 20, maxDamage: 40, speed: 2 } });
    const slow = clientItem({ slot: "main_hand", weapon: { minDamage: 50, maxDamage: 70, speed: 3.5 } });
    expect(compareItems(fast, slow).dps).toBe(-2.1);
    expect(compareItems(slow, fast).dps).toBe(2.1);
    expect(compareItems(fast, clientItem({ slot: "off_hand" })).dps).toBeNull();
    expect(compareItems(fast, clientItem({ weapon: slow.weapon, damageUnknown: true })).dps).toBeNull();
  });

  it("reports identical items as no change", () => {
    const item = clientItem({ armor: 30, stats: { stamina: 5 } });
    const delta = compareItems(item, { ...item, id: 2 });
    expect(delta).toEqual({ stats: [], armor: 0, dps: null, otherEffects: false, damageNotCompared: false });
    expect(deltaLines(delta)).toEqual([]);
  });
});

describe("the delta's lines", () => {
  it("prints gains with + and losses with a real minus, armor and damage first", () => {
    const lines = deltaLines({
      stats: [
        { key: "intellect", amount: -3 },
        { key: "stamina", amount: 12 },
        { key: "spell_crit_pct", amount: 1.5 },
        { key: "hit_pct", amount: -2 },
      ],
      armor: -4,
      dps: 2.5,
      otherEffects: false,
      damageNotCompared: false,
    });
    expect(lines.map((l) => l.text)).toEqual([
      "−4 Armor",
      "+2.5 damage per second",
      "−3 Intellect",
      "+12 Stamina",
      "+1.5% Spell crit %",
      "−2% Hit %",
    ]);
    expect(lines.map((l) => l.gain)).toEqual([false, true, false, true, true, false]);
  });
});

describe("the equipped items an item is compared with", () => {
  const ring = clientItem({ slot: "finger", stats: { stamina: 10 } });
  const byId = new Map<number, ClientItem>([
    [100, clientItem({ id: 100, slot: "finger", stats: { stamina: 4, spirit: 6 } })],
    [101, clientItem({ id: 101, slot: "finger", stats: { stamina: 10 } })],
    [102, clientItem({ id: 102, slot: "finger", randomSuffix: true })],
  ]);

  it("compares a ring with both worn rings", () => {
    const result = equippedComparisons(ring, [worn("FINGER_1", 100), worn("FINGER_2", 101)], byId);
    expect(result.map((r) => r.equipped.slot)).toEqual(["FINGER_1", "FINGER_2"]);
    expect(result[0]).toMatchObject({ kind: "known", delta: { stats: [{ key: "stamina", amount: 6 }, { key: "spirit", amount: -6 }] } });
    expect(result[1]).toMatchObject({ kind: "known", delta: { stats: [], armor: 0 } });
  });

  it("leaves an empty ring slot out", () => {
    expect(equippedComparisons(ring, [worn("FINGER_2", 101)], byId).map((r) => r.equipped.slot)).toEqual(["FINGER_2"]);
    expect(equippedComparisons(ring, [], byId)).toEqual([]);
  });

  it("says stats are unknown for a worn item missing from the game files or with a random suffix, never guessing", () => {
    const result = equippedComparisons(ring, [worn("FINGER_1", 999), worn("FINGER_2", 102)], byId);
    expect(result).toEqual([
      expect.objectContaining({ kind: "unknown", reason: "equipped" }),
      expect.objectContaining({ kind: "unknown", reason: "equipped" }),
    ]);
  });

  it("says the hovered item's stats are unknown when it has a random suffix", () => {
    const result = equippedComparisons({ ...ring, randomSuffix: true }, [worn("FINGER_1", 100)], byId);
    expect(result).toEqual([expect.objectContaining({ kind: "unknown", reason: "candidate" })]);
  });

  it("compares a shield with the off hand, and a two-hander with both hands", () => {
    const shield = clientItem({ slot: "off_hand", armor: 100 });
    const staff = clientItem({ slot: "two_hand", weapon: { minDamage: 50, maxDamage: 90, speed: 3 } });
    const items = [worn("MAIN_HAND", 100), worn("OFF_HAND", 101)];
    expect(equippedComparisons(shield, items, byId).map((r) => r.equipped.slot)).toEqual(["OFF_HAND"]);
    expect(equippedComparisons(staff, items, byId).map((r) => r.equipped.slot)).toEqual(["MAIN_HAND", "OFF_HAND"]);
  });
});

describe("slots with two-handers and shields", () => {
  const SHIELD = worn("OFF_HAND", 2, { inventory_type: "SHIELD" });

  it("compares an off-hand item with the two-hander that fills both hands, marked as replaced", () => {
    const twoHander = worn("MAIN_HAND", 1, { inventory_type: "TWOHWEAPON", weapon: WEAPON_TEXT });
    const bySlot = itemsBySlot([twoHander]);
    for (const slot of ["off_hand", "held_in_off_hand"] as const) {
      expect(comparisonSlots(slot, bySlot)).toEqual([{ slot: "MAIN_HAND", replacesTwoHander: true }]);
    }
    const shield = clientItem({ slot: "off_hand", armor: 100, stats: { stamina: 5 } });
    const byId = new Map([[1, clientItem({ id: 1, slot: "two_hand", stats: { stamina: 9 } })]]);
    const result = equippedComparisons(shield, [twoHander], byId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "known", replacesTwoHander: true, delta: { armor: 100, stats: [{ key: "stamina", amount: -4 }] } });
  });

  it("still compares an off-hand item with the off hand when one-handers are worn, and an empty off hand with nothing", () => {
    expect(comparisonSlots("off_hand", itemsBySlot([worn("MAIN_HAND", 1), SHIELD]))).toEqual([{ slot: "OFF_HAND", replacesTwoHander: false }]);
    expect(equippedComparisons(clientItem({ slot: "off_hand" }), [worn("MAIN_HAND", 1)], new Map())).toEqual([]);
  });

  it("compares a one-hander with the main hand only while a shield is in the off hand", () => {
    expect(slotsFor("one_hand", worn("MAIN_HAND", 1), SHIELD)).toEqual(["MAIN_HAND"]);
  });
});

describe("what a comparison cannot cover", () => {
  it("flags effects the game files only count, from either side, instead of claiming no change", () => {
    const plainItem = clientItem({ stats: { stamina: 5 } });
    const proc = clientItem({ stats: { stamina: 5 }, otherEffects: 1 });
    expect(compareItems(plainItem, proc)).toMatchObject({ stats: [], otherEffects: true });
    expect(compareItems(proc, plainItem).otherEffects).toBe(true);
    expect(compareItems(plainItem, plainItem).otherEffects).toBe(false);
    expect(deltaNotes(compareItems(plainItem, proc))).toEqual(["Other effects (procs, on-use, Equip:) aren't compared"]);
  });

  it("carries the flag through to the equipped comparison", () => {
    const ring = clientItem({ slot: "finger", otherEffects: 2 });
    const byId = new Map([[100, clientItem({ id: 100, slot: "finger" })]]);
    expect(equippedComparisons(ring, [worn("FINGER_1", 100)], byId)[0]).toMatchObject({ kind: "known", delta: { otherEffects: true } });
  });

  it("says damage is not compared when either weapon has unknown damage", () => {
    const known = clientItem({ slot: "main_hand", weapon: { minDamage: 10, maxDamage: 20, speed: 2 } });
    const caster = clientItem({ slot: "main_hand", weapon: { minDamage: 0, maxDamage: 0, speed: 2 }, damageUnknown: true });
    for (const delta of [compareItems(known, caster), compareItems(caster, known)]) {
      expect(delta).toMatchObject({ dps: null, damageNotCompared: true });
      expect(deltaNotes(delta)).toEqual(["Damage not compared"]);
    }
    expect(compareItems(known, known).damageNotCompared).toBe(false);
  });
});

describe("signed amounts", () => {
  it("formats from the absolute value with a real minus, a plus, or nothing for zero", () => {
    expect(formatSignedStat("stamina", 12)).toBe("+12");
    expect(formatSignedStat("stamina", -3)).toBe("−3");
    expect(formatSignedStat("stamina", 0)).toBe("0");
    expect(formatSignedStat("hit_pct", -2)).toBe("−2%");
    expect(formatSignedStat("crit_pct", 1.5)).toBe("+1.5%");
    expect(formatSignedNumber(18)).toBe("+18");
    expect(formatSignedNumber(-0.25)).toBe("−0.3");
    expect(formatSignedNumber(0)).toBe("0");
  });
});

describe("the saved character", () => {
  const stored = { faction: "A", classId: "warlock", zoneId: null, level: 37, position: null };

  it("reads settings saved before characters were remembered as having none", () => {
    expect(parsePlayerSettings(stored)).toMatchObject({ faction: "A", classId: "warlock", level: 37, characterSlug: null });
  });

  it("keeps a valid saved slug and drops a malformed one", () => {
    expect(parsePlayerSettings({ ...stored, characterSlug: "jason-kwon" })?.characterSlug).toBe("jason-kwon");
    expect(parsePlayerSettings({ ...stored, characterSlug: "not a slug!" })?.characterSlug).toBeNull();
    expect(parsePlayerSettings({ ...stored, characterSlug: 7 })?.characterSlug).toBeNull();
  });

  it("makes the slug part of 'already using this character'", () => {
    const character = { slug: "jason-kwon", faction: "alliance", class_name: "Warlock", level: 37 } as CharacterResponse;
    const wanted = playerSettingsFromCharacter(character);
    expect(wanted).toEqual({ faction: "A", classId: "warlock", level: 37, characterSlug: "jason-kwon" });
    if (!wanted) return;
    expect(settingsMatchCharacter(wanted, wanted)).toBe(true);
    expect(settingsMatchCharacter({ ...wanted, characterSlug: null }, wanted)).toBe(false);
    expect(settingsMatchCharacter({ ...wanted, characterSlug: "someone-else" }, wanted)).toBe(false);
  });
});
