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
import enchantingFile from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import { enchantEffect } from "@/games/wow-forever/lib/guild/enchantEffect";
import { mainStatPoint } from "@/games/wow-forever/lib/guild/mainStatPoint";
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

/** No item list: weapon speeds unknown. */
const NO_ITEMS: ReadonlyMap<number, ClientItem> = new Map();

function enchantRecipe(spell: number, name: string, effect = "Permanently enchant bracers to give +5 Stamina."): CraftRecipe {
  return {
    spell,
    name,
    yellow: 0,
    grey: 0,
    reagents: [{ id: 2840, name: "Strange Dust", count: 1 }],
    enchant: true,
    learn: { source: "trainer" },
    effect,
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
    const matches = computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER, NO_ITEMS);
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
    expect(computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER, NO_ITEMS)).toHaveLength(0);
  });

  it("an enchanter can enchant their own gear", () => {
    const member = makeMember("member", {
      recipe_ability_ids: [4289],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
      equipped: [wristItem()],
    });
    const matches = computeEnchantMatches([member], ENCHANTING_FILE_BRACER, NO_ITEMS);
    expect(matches.map((m) => [m.crafter.slug, m.beneficiary.slug])).toEqual([["member", "member"]]);
  });

  it("a guild mate's better enchant still beats the one you can make", () => {
    // ability 4289 → 7418 (+5 Stamina, fixture); 7510 → 13648 "Bracer - Stamina" (+9).
    const file: Pick<CraftingFile, "recipes"> = {
      recipes: [
        enchantRecipe(7418, "Enchant Bracer - Inferior Stamina"),
        enchantRecipe(13648, "Enchant Bracer - Stamina", "Permanently enchant bracers to give +9 Stamina."),
      ],
    };
    const enchanting = [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 200, max_skill: 300 }];
    const self = makeMember("me", { recipe_ability_ids: [4289], professions: enchanting, equipped: [wristItem()] });
    const mate = makeMember("mate", { recipe_ability_ids: [7510], professions: enchanting });
    const matches = computeEnchantMatches([self, mate], file, NO_ITEMS);
    expect(matches.map((m) => [m.crafter.slug, m.proposed.name])).toEqual([["mate", "Enchant Bracer - Stamina"]]);
  });

  it("you enchanting it yourself wins over a higher-skill guild mate", () => {
    const enchanting = (skill: number) => [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill, max_skill: 300 }];
    const self = makeMember("me", { recipe_ability_ids: [4289], professions: enchanting(100), equipped: [wristItem()] });
    const mate = makeMember("aaa-mate", { recipe_ability_ids: [4289], professions: enchanting(300) });
    for (const roster of [[self, mate], [mate, self]]) {
      const matches = computeEnchantMatches(roster, ENCHANTING_FILE_BRACER, NO_ITEMS);
      expect(matches.map((m) => m.crafter.slug)).toEqual(["me"]);
    }
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
    const matches = computeEnchantMatches([lowSkill, highSkill, beneficiary], ENCHANTING_FILE_BRACER, NO_ITEMS);
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
    expect(computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER, NO_ITEMS)).toHaveLength(0);
  });

  it("crafter knows the ability but not the enchant recipe → no match", () => {
    // ability 1 does not map to any known spell
    const crafter = makeMember("crafter", {
      recipe_ability_ids: [999999],
      professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
    });
    const beneficiary = makeMember("beneficiary", { equipped: [wristItem()] });
    expect(computeEnchantMatches([crafter, beneficiary], ENCHANTING_FILE_BRACER, NO_ITEMS)).toHaveLength(0);
  });

  it("empty member list returns no matches", () => {
    expect(computeEnchantMatches([], ENCHANTING_FILE_BRACER, NO_ITEMS)).toHaveLength(0);
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

  it("counts a member's own recipes for their own gear", () => {
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
    const matches = computeGearMatches([member], craftingFiles, itemList);
    expect(matches).toHaveLength(1);
    expect(matches[0].crafter.slug).toBe("member");
    expect(matches[0].beneficiary.slug).toBe("member");
  });

  it("prefers making it yourself when a guild mate can make the same upgrade", () => {
    const tailor = (slug: string, equipped: GuildHelpMember["equipped"] = []) => makeMember(slug, {
      class_name: "Mage",
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
      equipped,
    });
    const worn = [{ slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] }];
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    const pairs = (members: GuildHelpMember[]) =>
      computeGearMatches(members, craftingFiles, itemList).map((m) => [m.crafter.slug, m.beneficiary.slug]);
    // Whichever comes first in the roster, the member makes it themselves.
    expect(pairs([tailor("aaa"), tailor("zed", worn)])).toEqual([["zed", "zed"]]);
    expect(pairs([tailor("zed", worn), tailor("aaa")])).toEqual([["zed", "zed"]]);
  });

  it("two guild mates offering the same upgrade: the alphabetically first, whatever the roster order", () => {
    const worn = [{ slot: "WAIST", item_id: 5002, name: "Flimsy Chain Belt", item_level: 1, inventory_type: "WAIST", enchantments: [] }];
    const tailor = (slug: string) => makeMember(slug, {
      class_name: "Mage",
      recipe_ability_ids: [55423],
      professions: [{ profession_id: TAILORING_SKILL_ID, name: "Tailoring", skill: 100, max_skill: 300 }],
    });
    const needy = makeMember("needy", { class_name: "Mage", equipped: worn });
    const craftingFiles = new Map([[TAILORING_SKILL_ID, TAILORING_FILE_SASH]]);
    const itemList = makeItemList([MOCK_SASH_MAGE, MOCK_WORN_WAIST]);
    for (const roster of [[tailor("bob"), tailor("amy"), needy], [tailor("amy"), tailor("bob"), needy]]) {
      expect(computeGearMatches(roster, craftingFiles, itemList).map((m) => m.crafter.slug)).toEqual(["amy"]);
    }
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

describe("enchantEffect", () => {
  it("reads one stat in each tooltip wording", () => {
    expect(enchantEffect("Permanently enchant gloves to grant +7 Strength.")).toEqual({ stats: { strength: 7 }, armor: 0, weaponDamage: 0 });
    expect(enchantEffect("Permanently enchant a bracer so it increases the wearer's Intellect by 3.")?.stats).toEqual({ intellect: 3 });
    expect(enchantEffect("Permanently enchant a Two-Handed Melee Weapon to add 9 to Spirit.")?.stats).toEqual({ spirit: 9 });
    expect(enchantEffect("Permanently enchant bracers so that the defense skill of the wearer is increased by 3.")?.stats).toEqual({ defense: 3 });
  });

  it("reads all stats, spell power, resistances, armor and weapon damage", () => {
    expect(enchantEffect("Permanently enchant a piece of chest armor to grant +3 to all stats.")?.stats).toEqual({
      strength: 3, agility: 3, stamina: 3, intellect: 3, spirit: 3,
    });
    expect(enchantEffect("Permanently enchant bracers so they increase the wearer's healing spells by up to 24 and damage spells by up to 8.")?.stats)
      .toEqual({ healing: 24, spell_damage: 8 });
    expect(enchantEffect("Permanently enchant a cloak so that it increases resistance to fire by 7.")?.stats).toEqual({ fire_resistance: 7 });
    expect(enchantEffect("Permanently enchant a cloak to give 70 additional armor.")).toEqual({ stats: {}, armor: 70, weaponDamage: 0 });
    expect(enchantEffect("Permanently enchant a Melee Weapon to do 2 additional points of damage.")).toEqual({ stats: {}, armor: 0, weaponDamage: 2 });
  });

  it("reads spell power, school damage, healing and mana regen in each wording", () => {
    expect(enchantEffect("Permanently enchant gloves to increase shadow damage by up to 20.")?.stats).toEqual({ shadow_spell_damage: 20 });
    expect(enchantEffect("Permanently enchant a two-handed melee weapon to increase damage and healing by up to 55.")?.stats).toEqual({ spell_power: 55 });
    expect(enchantEffect("Permanently enchant a Melee Weapon to add up to 30 damage to spells.")?.stats).toEqual({ spell_damage: 30 });
    expect(enchantEffect("Permanently enchant bracers to increase healing by up to 16 and damage by up to 6.")?.stats).toEqual({ healing: 16, spell_damage: 6 });
    expect(enchantEffect("Permanently enchant a weapon to grant up to 15 additional frost damage when casting frost spells.")?.stats).toEqual({ frost_spell_damage: 15 });
    expect(enchantEffect("Permanently enchant bracers to restore 4 mana every 5 seconds.")?.stats).toEqual({ mp5: 4 });
    expect(enchantEffect("Permanently enchant a cloak to give 12 Fire Resistance.")?.stats).toEqual({ fire_resistance: 12 });
    expect(enchantEffect("Permanently enchant a cloak to give a 1% chance to dodge.")?.stats).toEqual({ dodge_pct: 1 });
  });

  it.each([
    "Permanently enchant gloves to grant +2 fishing skill.",
    "Permanently enchant boots to increase movement speed by 8%.",
    "Permanently enchant a Melee Weapon to do 6 additional points of damage to Beasts.",
    "Enchant a piece of chest armor so it has a 5% chance per hit of giving you 25 points of damage absorption.",
    "Permanently enchant a melee weapon to often strike for 40 additional fire damage.",
  ])("leaves out what a stat weight can't score: %s", (text) => {
    expect(enchantEffect(text)).toBeNull();
  });
});

describe("enchantEffect over every enchant", () => {
  // Locks the parser against the real data: each of these is a proc, gathering, speed, stealth,
  // threat or slayer enchant; every other enchant must read into something a stat weight scores.
  const UNSCORED_NAMES = new Set([
    "Boots - Minor Speed", "Boots - Speed", "Chest - Absorption", "Chest - Lesser Absorption", "Chest - Minor Absorption",
    "Cloak - Stealth", "Cloak - Subtlety", "Gloves - Advanced Herbalism", "Gloves - Advanced Mining", "Gloves - Advanced Skinning",
    "Gloves - Fishing", "Gloves - Herbalism", "Gloves - Lotus Claw", "Gloves - Mining", "Gloves - Minor Haste",
    "Gloves - Riding Skill", "Gloves - Skinning", "Gloves - Threat", "Weapon - Crusader", "Weapon - Demonslaying",
    "Weapon - Fiery Weapon", "Weapon - Icy Chill", "Weapon - Insight", "Weapon - Lesser Beastslayer",
    "Weapon - Lesser Elemental Slayer", "Weapon - Lifestealing", "Weapon - Minor Beastslayer", "Weapon - Recovery",
    "Weapon - Revelation", "Weapon - Unholy Weapon",
  ]);
  const enchants = (enchantingFile as { recipes: CraftRecipe[] }).recipes.filter((r) => r.enchant);

  it.each(enchants.map((r) => [r.name.replace(/^Enchant /, ""), r.effect ?? null] as const))("%s", (name, effect) => {
    expect(enchantEffect(effect) === null).toBe(UNSCORED_NAMES.has(name));
  });
});

describe("computeEnchantMatches values the enchant for the wearer's class", () => {
  // ability 7668 → 13887 "Enchant Gloves - Strength"; 7456 → 13536 "Bracer - Lesser Strength";
  // 7500 → 13622 "Bracer - Lesser Intellect"; 7426 → 13503 "Weapon - Lesser Striking".
  const FILE: Pick<CraftingFile, "recipes"> = {
    recipes: [
      enchantRecipe(13887, "Enchant Gloves - Strength", "Permanently enchant gloves to grant +7 Strength."),
      enchantRecipe(13536, "Enchant Bracer - Lesser Strength", "Permanently enchant a bracer so it increases the wearer's Strength by 4."),
      enchantRecipe(13622, "Enchant Bracer - Lesser Intellect", "Permanently enchant a bracer so it increases the wearer's Intellect by 3."),
      enchantRecipe(13503, "Enchant Weapon - Lesser Striking", "Permanently enchant a Melee Weapon to do 2 additional points of damage."),
      enchantRecipe(13815, "Enchant Gloves - Agility", "Permanently enchant gloves to grant +7 Agility."),
    ],
  };
  const enchanter = makeMember("feranova", {
    recipe_ability_ids: [7668, 7456, 7500, 7426, 7659],
    professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 225, max_skill: 225 }],
  });
  const gloves = { slot: "HANDS", item_id: 3001, name: "Prisoner Handwraps", item_level: 44, inventory_type: "HAND", enchantments: [] };
  const sword = { slot: "MAIN_HAND", item_id: 3002, name: "Sword", item_level: 30, inventory_type: "WEAPON", enchantments: [] };

  it("never offers +7 Strength gloves to a Warlock, but does to a Warrior", () => {
    const warlock = makeMember("jason", { class_name: "Warlock", level: 45, equipped: [gloves] });
    const warrior = makeMember("tank", { class_name: "Warrior", level: 45, equipped: [gloves] });
    const matches = computeEnchantMatches([enchanter, warlock, warrior], FILE, NO_ITEMS);
    expect(matches.map((m) => [m.beneficiary.slug, m.proposed.name])).toEqual([["tank", "Enchant Gloves - Strength"]]);
  });

  it("drops an enchant worth only a token to the wearer: no +7 Agility gloves for an Affliction Warlock", () => {
    // Spec weights give every Warlock spec 0.05 Agility, so +7 Agility is 0.35 — under one main-stat point.
    const warlock = makeMember("jason", { class_name: "Warlock", level: 45, equipped: [gloves], talents: [{ tree_id: 355, points: 21 }] });
    const rogue = makeMember("stab", { class_name: "Rogue", level: 45, equipped: [gloves] });
    const matches = computeEnchantMatches([enchanter, warlock, rogue], FILE, NO_ITEMS);
    expect(matches.map((m) => [m.beneficiary.slug, m.proposed.name])).toEqual([["stab", "Enchant Gloves - Agility"]]);
  });

  it("the floor is one point of the wearer's best main stat, however their weights are scaled", () => {
    const w = (stats: Record<string, number>) => ({ stats, meleeWeaponDps: 0, rangedWeaponDps: 0, armor: 0.02 });
    expect(mainStatPoint(w({ agility: 0.05, spell_power: 1, spell_hit_pct: 9.6 }))).toBe(1);
    expect(mainStatPoint(w({ intellect: 0.38, healing: 0.3 }))).toBe(0.38);
    expect(mainStatPoint(w({}))).toBe(0);
  });

  it("picks the bracer enchant each class uses: Intellect for a Warlock, Strength for a Warrior", () => {
    const wrist = wristItem();
    const warlock = makeMember("jason", { class_name: "Warlock", equipped: [wrist] });
    const warrior = makeMember("tank", { class_name: "Warrior", equipped: [wrist] });
    const byMember = new Map(computeEnchantMatches([enchanter, warlock, warrior], FILE, NO_ITEMS).map((m) => [m.beneficiary.slug, m.proposed.name]));
    expect(byMember.get("jason")).toBe("Enchant Bracer - Lesser Intellect");
    expect(byMember.get("tank")).toBe("Enchant Bracer - Lesser Strength");
  });

  it("weighs weapon damage only when the weapon's speed is known", () => {
    const warrior = makeMember("tank", { class_name: "Warrior", equipped: [sword] });
    expect(computeEnchantMatches([enchanter, warrior], FILE, NO_ITEMS)).toHaveLength(0);
    const swordItem = { id: 3002, weapon: { minDamage: 20, maxDamage: 40, speed: 2.5 } } as ClientItem;
    const matches = computeEnchantMatches([enchanter, warrior], FILE, new Map([[3002, swordItem]]));
    expect(matches.map((m) => m.proposed.name)).toEqual(["Enchant Weapon - Lesser Striking"]);
  });
});

describe("enchant slot restrictions", () => {
  const enchanter = () => makeMember("crafter", {
    recipe_ability_ids: [4289],
    professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
  });
  const weaponFile: Pick<CraftingFile, "recipes"> = { recipes: [enchantRecipe(7418, "Enchant Weapon - Minor Stamina", "Permanently enchant a Melee Weapon to add 3 to Stamina.")] };
  const wearing = (slot: string, inventory_type: string) => makeMember("beneficiary", {
    equipped: [{ slot, item_id: 2001, name: "Thing", item_level: 10, inventory_type, enchantments: [] }],
  });

  it("a one-hand weapon enchant matches a one-handed main hand", () => {
    expect(computeEnchantMatches([enchanter(), wearing("MAIN_HAND", "WEAPON")], weaponFile, NO_ITEMS)).toHaveLength(1);
  });

  it.each([["MAIN_HAND", "TWOHWEAPON"], ["OFF_HAND", "SHIELD"], ["OFF_HAND", "HOLDABLE"]])(
    "a one-hand weapon enchant never matches %s %s",
    (slot, type) => {
      expect(computeEnchantMatches([enchanter(), wearing(slot, type)], weaponFile, NO_ITEMS)).toHaveLength(0);
    },
  );

  it("never matches rings or trinkets", () => {
    expect(computeEnchantMatches([enchanter(), wearing("FINGER_1", "FINGER")], weaponFile, NO_ITEMS)).toHaveLength(0);
    expect(computeEnchantMatches([enchanter(), wearing("TRINKET_1", "TRINKET")], weaponFile, NO_ITEMS)).toHaveLength(0);
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
  const STAMINA = (n: number) => `Permanently enchant bracers to give +${n} Stamina.`;
  function twoEnchantFile(effectA: string, effectB: string): Pick<CraftingFile, "recipes"> {
    return {
      recipes: [
        { ...enchantRecipe(7418, "Enchant Bracer - Inferior Stamina", effectA), grey: 200 },
        { ...enchantRecipe(7428, "Enchant Bracer - Minor Deflect", effectB), grey: 100 },
      ],
    };
  }
  const crafter = () => makeMember("crafter", {
    recipe_ability_ids: [4289, 4293],
    professions: [{ profession_id: PROFESSION_SKILL_LINES.enchanting, name: "Enchanting", skill: 100, max_skill: 300 }],
  });
  const beneficiary = () => makeMember("beneficiary", { equipped: [wristItem({ enchantments: [] })] });

  it("picks the enchant worth more to the wearer, not the one with the higher grey skill", () => {
    // 7418 has grey 200 but +1 Stamina; 7428 has grey 100 but +3 Stamina -- 7428 wins.
    const matches = computeEnchantMatches([crafter(), beneficiary()], twoEnchantFile(STAMINA(1), STAMINA(3)), NO_ITEMS);
    expect(matches).toHaveLength(1);
    expect(matches[0].proposed.spell).toBe(7428);
  });

  it("when both are worth the same, the higher spell id wins as a stable tiebreaker", () => {
    const matches = computeEnchantMatches([crafter(), beneficiary()], twoEnchantFile(STAMINA(2), STAMINA(2)), NO_ITEMS);
    expect(matches).toHaveLength(1);
    expect(matches[0].proposed.spell).toBe(7428);
  });
});
