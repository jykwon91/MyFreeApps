/**
 * Unit tests for guild help matching logic.
 *
 * We use real ability-id → spell-id pairs from recipeSpells.json so the
 * `recipeSpell()` lookups work without any mocking.
 *
 * Known pairs used here (from recipeSpells.json + crafting JSONs):
 *   ability 4289  → spell 7418  "Enchant Bracer - Inferior Stamina"   (Bracer enchant)
 *   ability 4293  → spell 7428  "Enchant Bracer - Minor Deflect"       (Bracer enchant)
 *   ability 4360  → spell 7766  "Enchant Bracer - Minor Spirit"        (Bracer enchant)
 *   ability 55423 → spell 1257368 "Novice Arcanist's Sash" tailoring    (waist → WAIST)
 *   ability 55424 → spell 1257369 "Novice Ardent's Sash"   tailoring    (waist → WAIST)
 *
 * Item IDs used here (exist in items.json):
 *   253885  Novice Arcanist's Sash — slot "waist" → WAIST, ilvl 15, stats {intellect:3, spell_power:4, stamina:3}
 *   253887  Novice Ardent's Sash   — slot "waist" → WAIST, ilvl 15, stats {spirit:3, stamina:4}
 */
import { describe, expect, it } from "vitest";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { computeEnchantMatches } from "@/games/wow-forever/lib/guild/guildEnchantMatches";
import { computeGearMatches } from "@/games/wow-forever/lib/guild/guildGearMatches";
import { resolveHelpSpecId, TALENT_TREE_SPEC_ID } from "@/games/wow-forever/lib/guild/guildHelpSpec";
import type { CraftRecipe, CraftingFile } from "@/games/wow-forever/types/crafting";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";
import type { GuildMemberTalentTree } from "@/games/wow-forever/types/guild/guildMemberTalentTree";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(
  slug: string,
  opts: {
    class_name?: string | null;
    level?: number;
    equipped?: GuildHelpMember["equipped"];
    recipe_ability_ids?: number[];
    professions?: GuildHelpMember["professions"];
    talents?: GuildMemberTalentTree[] | null;
  } = {},
): GuildHelpMember {
  return {
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    surname: "",
    class_name: opts.class_name ?? "Mage",
    level: opts.level ?? 60,
    equipped: opts.equipped ?? [],
    recipe_ability_ids: opts.recipe_ability_ids ?? [],
    professions: opts.professions ?? [],
    // null means "talents never fetched" — the leveling-fallback path.
    talents: opts.talents !== undefined ? opts.talents : null,
  };
}

function wristItem(opts: { enchantments?: string[]; inventory_type?: string } = {}) {
  return {
    slot: "WRIST",
    item_id: 1001,
    name: "Linen Bracers",
    item_level: 10,
    inventory_type: opts.inventory_type ?? "WRIST",
    enchantments: opts.enchantments ?? [],
  };
}

function enchantRecipe(spell: number, name: string): CraftRecipe {
  return {
    spell,
    name,
    yellow: 0,
    grey: 0,
    reagents: [{ id: 2840, name: "Strange Dust", count: 1 }],
    enchant: true,
    learn: { source: "trainer" },
  };
}

/** Minimal enchanting file with one bracer enchant (spell 7418 / ability 4289). */
const ENCHANTING_FILE_BRACER: Pick<CraftingFile, "recipes"> = {
  recipes: [enchantRecipe(7418, "Enchant Bracer - Inferior Stamina")],
};

// ---------------------------------------------------------------------------
// computeEnchantMatches
// ---------------------------------------------------------------------------

describe("computeEnchantMatches", () => {
  it("returns a match when crafter knows a bracer enchant and beneficiary has an unenchanted bracer", () => {
    // ability 4289 → spell 7418 → "Enchant Bracer - Inferior Stamina"
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      equipped: [wristItem({ enchantments: [] })],
    });
    const matches = computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER);
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.type).toBe("enchant");
    expect(m.crafter.slug).toBe("crafter");
    expect(m.beneficiary.slug).toBe("beneficiary");
    expect(m.slot.blizzard_slot).toBe("WRIST");
    expect(m.proposed.spell).toBe(7418);
  });

  it("returns no match when the beneficiary's bracer is already enchanted", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      equipped: [wristItem({ enchantments: ["Enchant Bracer - Minor Stamina"] })],
    });
    expect(computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER)).toHaveLength(0);
  });

  it("does not match crafter to themselves", () => {
    const member = makeMember("member", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
      equipped: [wristItem()],
    });
    expect(computeEnchantMatches([member], ENCHANTING_FILE_BRACER)).toHaveLength(0);
  });

  it("deduplicates to the highest-skill enchanter per (beneficiary, slot)", () => {
    const lowSkill = makeMember("low-skill", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 50, max_skill: 300 }],
    });
    const highSkill = makeMember("high-skill", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 200, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      equipped: [wristItem()],
    });
    const matches = computeEnchantMatches([lowSkill, highSkill, beneficiary], ENCHANTING_FILE_BRACER);
    expect(matches).toHaveLength(1);
    expect(matches[0].crafter.slug).toBe("high-skill");
    expect(matches[0].crafter.skill).toBe(200);
  });

  it("crafter with no Enchanting profession is skipped", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.tailoring, name: "Tailoring", skill: 300, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", { equipped: [wristItem()] });
    expect(computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER)).toHaveLength(0);
  });

  it("crafter knows the ability but not the enchant recipe → no match", () => {
    // ability 1 does not map to any known spell
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [999999],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", { equipped: [wristItem()] });
    expect(computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER)).toHaveLength(0);
  });

  it("empty member list returns no matches", () => {
    expect(computeEnchantMatches([], ENCHANTING_FILE_BRACER)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeGearMatches
// ---------------------------------------------------------------------------

/** A minimal ClientItem for testing gear scoring. Stats favour mage (intellect, spell_power). */
const MOCK_SASH_MAGE: ClientItem = {
  id: 253885,
  name: "Novice Arcanist's Sash",
  quality: "rare",
  slot: "waist",
  itemType: "Cloth",
  itemLevel: 15,
  requiredLevel: 10,
  armor: 17,
  weapon: null,
  stats: { intellect: 3, spell_power: 4, stamina: 3 },
  classes: null,
  damageUnknown: false,
  otherEffects: 0,
  randomSuffix: false,
};

/** A worse worn sash: very low stats so the crafted one is clearly an upgrade. */
const MOCK_WORN_WAIST: ClientItem = {
  id: 5002,
  name: "Flimsy Chain Belt",
  quality: "common",
  slot: "waist",
  itemType: "Mail",
  itemLevel: 1,
  requiredLevel: 1,
  armor: 5,
  weapon: null,
  stats: { stamina: 1 },
  classes: null,
  damageUnknown: false,
  otherEffects: 0,
  randomSuffix: false,
};

function makeItemList(items: ClientItem[]): ClientItemList {
  return {
    items,
    byId: new Map(items.map((i) => [i.id, i])),
    searchNames: items.map((i) => i.name.toLowerCase()),
    searchWords: items.map((i) => i.name.toLowerCase().split(/\s+/)),
    clientBuild: "",
    attribution: "",
  };
}

/** Tailoring file with the sash recipe (spell 1257368, ability 55423). */
const TAILORING_FILE_SASH: Pick<CraftingFile, "recipes"> = {
  recipes: [
    {
      spell: 1257368,
      name: "Novice Arcanist's Sash",
      yellow: 1,
      grey: 10,
      reagents: [{ id: 2996, name: "Bolt of Linen Cloth", count: 2 }],
      creates: { id: 253885, name: "Novice Arcanist's Sash", count: 1, quality: 2 },
      learn: { source: "trainer" },
    },
  ],
};

const TAILORING_SKILL_ID = PROFESSION_SKILL_LINES.tailoring;

describe("computeGearMatches", () => {
  it("returns a gear upgrade match when crafter knows a recipe that scores better than what the beneficiary wears", () => {
    // ability 55423 → spell 1257368 (Novice Arcanist's Sash) — crafts item 253885 (waist → WAIST)
    const crafter = makeMember("crafter", {
      class_name: "Warrior",
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      class_name: "Mage",
      equipped: [
        { slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] },
      ],
    });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    const matches = computeGearMatches([crafter, beneficiary], craftingFiles, itemList);
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.type).toBe("gear");
    expect(m.crafter.slug).toBe("crafter");
    expect(m.beneficiary.slug).toBe("beneficiary");
    expect(m.slot.blizzard_slot).toBe("WAIST");
    expect(m.upgrade_pct).toBeGreaterThan(0);
    expect(m.proposed.item_id).toBe(253885);
  });

  it("does not match crafter to themselves", () => {
    const member = makeMember("member", {
      class_name: "Mage",
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
      equipped: [
        { slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] },
      ],
    });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    expect(computeGearMatches([member], craftingFiles, itemList)).toHaveLength(0);
  });

  it("skips crafted items not in the item list", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      class_name: "Mage",
      equipped: [
        { slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] },
      ],
    });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    // Item list without the crafted item
    const itemList = makeItemList([MOCK_WORN_WAIST]);
    expect(computeGearMatches([crafter, beneficiary], craftingFiles, itemList)).toHaveLength(0);
  });

  it("deduplicates to the best upgrade per (beneficiary, slot)", () => {
    const crafterA = makeMember("crafter-a", {
      recipe_ability_ids: [55423], // sash spell 1257368
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    const crafterB = makeMember("crafter-b", {
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 200, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      class_name: "Mage",
      equipped: [
        { slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] },
      ],
    });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    // Both crafters produce the same item so the upgrade_pct is identical;
    // deduplication keeps exactly one.
    const matches = computeGearMatches([crafterA, crafterB, beneficiary], craftingFiles, itemList);
    expect(matches).toHaveLength(1);
  });

  it("empty member list returns no matches", () => {
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    expect(computeGearMatches([], craftingFiles, itemList)).toHaveLength(0);
  });

  it("beneficiary not wearing anything in the slot → no match", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    // Beneficiary wears nothing in WAIST
    const beneficiary = makeMember("beneficiary", { class_name: "Mage", equipped: [] });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE]);
    expect(computeGearMatches([crafter, beneficiary], craftingFiles, itemList)).toHaveLength(0);
  });

  it("beneficiary with known spec talents scores via spec path (not leveling fallback)", () => {
    // A Mage with Arcane talents (tree 237, most points) should score intellect/spell_power gear
    // higher than leveling weights.  Either way a match is expected — the test verifies
    // the spec path doesn't throw and produces a valid result.
    const crafter = makeMember("crafter", {
      class_name: "Warrior",
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      class_name: "Mage",
      // Arcane tree (237) with 20 points — resolveHelpSpecId should return "arcane"
      talents: [
        { tree_id: 237, points: 20 },
        { tree_id: 8, points: 5 },
      ],
      equipped: [
        { slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] },
      ],
    });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    const matches = computeGearMatches([crafter, beneficiary], craftingFiles, itemList);
    expect(matches).toHaveLength(1);
    expect(matches[0].beneficiary.slug).toBe("beneficiary");
  });

  it("beneficiary with null talents falls back to leveling weights and still matches", () => {
    const crafter = makeMember("crafter", {
      class_name: "Warrior",
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      class_name: "Mage",
      talents: null, // never fetched — leveling fallback path
      equipped: [
        { slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] },
      ],
    });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    const matches = computeGearMatches([crafter, beneficiary], craftingFiles, itemList);
    expect(matches).toHaveLength(1);
    expect(matches[0].beneficiary.slug).toBe("beneficiary");
  });
});

// ---------------------------------------------------------------------------
// resolveHelpSpecId
// ---------------------------------------------------------------------------

describe("enchant slot restrictions", () => {
  const enchanter = () => makeMember("crafter", {
    recipe_ability_ids: [4289],
    professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
  });
  const weaponFile: Pick<CraftingFile, "recipes"> = { recipes: [enchantRecipe(7418, "Enchant Weapon - Minor Beastslayer")] };
  const wearing = (slot: string, inventory_type: string) => makeMember("beneficiary", {
    equipped: [{ slot, item_id: 2001, name: "Thing", item_level: 10, inventory_type, enchantments: [] }],
  });

  it("a one-hand weapon enchant matches a one-handed main hand", () => {
    expect(computeEnchantMatches([enchanter(), wearing("MAIN_HAND", "WEAPON")], weaponFile)).toHaveLength(1);
  });

  it.each([["MAIN_HAND", "TWOHWEAPON"], ["OFF_HAND", "SHIELD"], ["OFF_HAND", "HOLDABLE"]])(
    "a one-hand weapon enchant never matches %s %s",
    (slot, type) => {
      expect(computeEnchantMatches([enchanter(), wearing(slot, type)], weaponFile)).toHaveLength(0);
    },
  );

  it("never matches rings or trinkets", () => {
    expect(computeEnchantMatches([enchanter(), wearing("FINGER_1", "FINGER")], weaponFile)).toHaveLength(0);
    expect(computeEnchantMatches([enchanter(), wearing("TRINKET_1", "TRINKET")], weaponFile)).toHaveLength(0);
  });
});

describe("computeGearMatches restrictions", () => {
  const crafter = () => makeMember("crafter", {
    recipe_ability_ids: [55423],
    professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
  });
  const files = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
  const worn = [{ slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] }];

  it("skips an item the beneficiary can't wear (plate for a Mage)", () => {
    const plate: ClientItem = { ...MOCK_SASH_MAGE, itemType: "Plate" };
    const beneficiary = makeMember("beneficiary", { class_name: "Mage", equipped: worn });
    expect(computeGearMatches([crafter(), beneficiary], files, makeItemList([plate, MOCK_WORN_WAIST]))).toHaveLength(0);
  });

  it("skips an item above the beneficiary's level", () => {
    const beneficiary = makeMember("beneficiary", { class_name: "Mage", level: 5, equipped: worn });
    expect(computeGearMatches([crafter(), beneficiary], files, makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]))).toHaveLength(0);
  });

  it("skips a slot whose worn item can't be scored (not in the item list)", () => {
    const beneficiary = makeMember("beneficiary", { class_name: "Mage", equipped: worn });
    expect(computeGearMatches([crafter(), beneficiary], files, makeItemList([MOCK_SASH_MAGE]))).toHaveLength(0);
  });

  it("labels the slot with the paper-doll name, not the item name", () => {
    const beneficiary = makeMember("beneficiary", { class_name: "Mage", equipped: worn });
    const [m] = computeGearMatches([crafter(), beneficiary], files, makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]));
    expect(m.slot.slot_label).toBe("Waist");
  });
});

describe("resolveHelpSpecId", () => {
  it("returns the spec id for a known dominant tree", () => {
    // Warlock Affliction (tree 355) → "affliction"
    expect(resolveHelpSpecId([{ tree_id: 355, points: 30 }])).toBe("affliction");
  });

  it("picks the tree with the most points as the dominant one", () => {
    // Mage Fire (8) has fewer points than Frost (6) — dominant is Frost
    expect(resolveHelpSpecId([
      { tree_id: 8, points: 10 },
      { tree_id: 6, points: 20 },
      { tree_id: 237, points: 5 },
    ])).toBe("frost");
  });

  it("returns null for null talents", () => {
    expect(resolveHelpSpecId(null)).toBeNull();
  });

  it("returns null for empty talents array", () => {
    expect(resolveHelpSpecId([])).toBeNull();
  });

  it("returns null for an unknown tree id", () => {
    expect(resolveHelpSpecId([{ tree_id: 99999, points: 50 }])).toBeNull();
  });

  it("covers all 27 Classic talent trees (TALENT_TREE_SPEC_ID has correct size)", () => {
    // 9 classes × 3 trees = 27 entries
    expect(Object.keys(TALENT_TREE_SPEC_ID)).toHaveLength(27);
  });
});


// ---------------------------------------------------------------------------
// computeGearMatches -- weapon slot matching (Issue 1)
//
// ability 5338 -> spell 9983  "Copper Claymore"    blacksmithing (two_hand Sword, item_id 7955)
// ability 1652 -> spell 2739  "Copper Shortsword"  blacksmithing (one_hand Sword, item_id 2847)
// ---------------------------------------------------------------------------

/** Mock ClientItem for a crafted two-hand Sword (Copper Claymore). */
const MOCK_COPPER_CLAYMORE: ClientItem = {
  id: 7955,
  name: "Copper Claymore",
  quality: "common",
  slot: "two_hand",
  itemType: "Sword",
  itemLevel: 11,
  requiredLevel: 6,
  armor: null,
  weapon: null,
  stats: { strength: 5, stamina: 3 },
  classes: null,
  damageUnknown: false,
  otherEffects: 0,
  randomSuffix: false,
};

/** Mock ClientItem for a crafted one-hand Sword (Copper Shortsword). */
const MOCK_COPPER_SHORTSWORD: ClientItem = {
  id: 2847,
  name: "Copper Shortsword",
  quality: "common",
  slot: "one_hand",
  itemType: "Sword",
  itemLevel: 10,
  requiredLevel: 4,
  armor: null,
  weapon: null,
  stats: { agility: 4, stamina: 2 },
  classes: null,
  damageUnknown: false,
  otherEffects: 0,
  randomSuffix: false,
};

/** Worn items -- very low stats so the crafted item is always a clear upgrade. */
const MOCK_WORN_2H: ClientItem = {
  id: 9900, name: "Rusty Claymore", quality: "poor", slot: "two_hand",
  itemType: "Sword", itemLevel: 1, requiredLevel: 1, armor: null, weapon: null,
  stats: {}, classes: null, damageUnknown: false, otherEffects: 0, randomSuffix: false,
};
const MOCK_WORN_1H: ClientItem = {
  id: 9901, name: "Bent Sword", quality: "poor", slot: "one_hand",
  itemType: "Sword", itemLevel: 1, requiredLevel: 1, armor: null, weapon: null,
  stats: {}, classes: null, damageUnknown: false, otherEffects: 0, randomSuffix: false,
};

const BS_SKILL_ID = PROFESSION_SKILL_LINES.blacksmithing;

/** Blacksmithing file with the Copper Claymore recipe (ability 5338 -> spell 9983). */
const BS_FILE_CLAYMORE: Pick<CraftingFile, "recipes"> = {
  recipes: [{ spell: 9983, name: "Copper Claymore", yellow: 1, grey: 50,
    reagents: [{ id: 2840, name: "Copper Bar", count: 4 }],
    creates: { id: 7955, name: "Copper Claymore", count: 1, quality: 1 },
    learn: { source: "trainer" } }],
};

/** Blacksmithing file with the Copper Shortsword recipe (ability 1652 -> spell 2739). */
const BS_FILE_SHORTSWORD: Pick<CraftingFile, "recipes"> = {
  recipes: [{ spell: 2739, name: "Copper Shortsword", yellow: 1, grey: 40,
    reagents: [{ id: 2840, name: "Copper Bar", count: 2 }],
    creates: { id: 2847, name: "Copper Shortsword", count: 1, quality: 1 },
    learn: { source: "trainer" } }],
};

describe("computeGearMatches weapon slot handling", () => {
  it("two-hand crafted sword matches Warrior's MAIN_HAND slot", () => {
    const crafter = makeMember("smith", {
      class_name: "Paladin",
      recipe_ability_ids: [5338],
      professions: [{ profession_id: BS_SKILL_ID, name: "Blacksmithing", skill: 100, max_skill: 300 }],
    });
    const warrior = makeMember("warrior", {
      class_name: "Warrior",
      level: 60,
      equipped: [
        { slot: "MAIN_HAND", item_id: 9900, name: "Rusty Claymore", item_level: 1, inventory_type: "TWOHWEAPON", enchantments: [] },
      ],
    });
    const files = new Map([[BS_SKILL_ID, BS_FILE_CLAYMORE]]);
    const itemList = makeItemList([MOCK_COPPER_CLAYMORE, MOCK_WORN_2H]);
    const matches = computeGearMatches([crafter, warrior], files, itemList);
    expect(matches.some((m) => m.beneficiary.slug === "warrior" && m.slot.blizzard_slot === "MAIN_HAND")).toBe(true);
  });

  it("one-hand crafted sword matches Rogue's OFF_HAND slot (Rogues dual-wield at level 1)", () => {
    const crafter = makeMember("smith", {
      class_name: "Paladin",
      recipe_ability_ids: [1652],
      professions: [{ profession_id: BS_SKILL_ID, name: "Blacksmithing", skill: 100, max_skill: 300 }],
    });
    const rogue = makeMember("rogue", {
      class_name: "Rogue",
      level: 20,
      equipped: [
        { slot: "OFF_HAND", item_id: 9901, name: "Bent Sword", item_level: 1, inventory_type: "WEAPON", enchantments: [] },
      ],
    });
    const files = new Map([[BS_SKILL_ID, BS_FILE_SHORTSWORD]]);
    const itemList = makeItemList([MOCK_COPPER_SHORTSWORD, MOCK_WORN_1H]);
    const matches = computeGearMatches([crafter, rogue], files, itemList);
    expect(matches.some((m) => m.beneficiary.slug === "rogue" && m.slot.blizzard_slot === "OFF_HAND")).toBe(true);
  });

  it("one-hand crafted sword does NOT match Paladin's OFF_HAND (Paladins cannot dual-wield)", () => {
    const crafter = makeMember("smith", {
      class_name: "Warrior",
      recipe_ability_ids: [1652],
      professions: [{ profession_id: BS_SKILL_ID, name: "Blacksmithing", skill: 100, max_skill: 300 }],
    });
    const paladin = makeMember("paladin", {
      class_name: "Paladin",
      level: 20,
      equipped: [
        { slot: "OFF_HAND", item_id: 9901, name: "Bent Sword", item_level: 1, inventory_type: "WEAPON", enchantments: [] },
      ],
    });
    const files = new Map([[BS_SKILL_ID, BS_FILE_SHORTSWORD]]);
    const itemList = makeItemList([MOCK_COPPER_SHORTSWORD, MOCK_WORN_1H]);
    const matches = computeGearMatches([crafter, paladin], files, itemList);
    expect(matches.filter((m) => m.beneficiary.slug === "paladin" && m.slot.blizzard_slot === "OFF_HAND")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeEnchantMatches -- best-pick dedup within one crafter (Issue 5)
// ---------------------------------------------------------------------------

describe("computeEnchantMatches best-pick dedup (single crafter, multiple enchants for same slot)", () => {
  function twoEnchantFile(greyA: number, greyB: number): Pick<CraftingFile, "recipes"> {
    return {
      recipes: [
        { spell: 7418, name: "Enchant Bracer - Inferior Stamina", yellow: 0, grey: greyA,
          reagents: [{ id: 2840, name: "Strange Dust", count: 1 }], enchant: true,
          learn: { source: "trainer" } },
        { spell: 7428, name: "Enchant Bracer - Minor Deflect", yellow: 0, grey: greyB,
          reagents: [{ id: 2840, name: "Strange Dust", count: 1 }], enchant: true,
          learn: { source: "trainer" } },
      ],
    };
  }

  it("picks the enchant with the higher grey value when one crafter knows two bracer enchants", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [4289, 4293],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      equipped: [wristItem({ enchantments: [] })],
    });
    // spell 7418 grey=100 vs spell 7428 grey=200 -- 7428 wins.
    const matches = computeEnchantMatches([crafter, beneficiary], twoEnchantFile(100, 200));
    expect(matches).toHaveLength(1);
    expect(matches[0].proposed.spell).toBe(7428);
  });

  it("when grey values are equal, the higher spell id wins as a stable tiebreaker", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [4289, 4293],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      equipped: [wristItem({ enchantments: [] })],
    });
    // Both grey=50 -- spell 7428 > 7418 wins.
    const matches = computeEnchantMatches([crafter, beneficiary], twoEnchantFile(50, 50));
    expect(matches).toHaveLength(1);
    expect(matches[0].proposed.spell).toBe(7428);
  });

  it("still deduplicates to one match per (beneficiary, slot) with best-pick logic", () => {
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [4289, 4293],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", {
      equipped: [wristItem({ enchantments: [] })],
    });
    // Two enchants for same slot -- always exactly one result.
    const matches = computeEnchantMatches([crafter, beneficiary], twoEnchantFile(50, 150));
    expect(matches).toHaveLength(1);
  });
});
