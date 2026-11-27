import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { lootAddonZip } from "@/games/wow-forever/lib/lootAddon/lootAddonZip";
import addonLua from "../../addon/MGALoot/MGALoot.lua?raw";
import hubLua from "../../addon/MGAHub/MGAHub.lua?raw";
import addonToc from "../../addon/MGALoot/MGALoot.toc?raw";
import { lootAddonDataLua } from "@/games/wow-forever/lib/lootAddon/lootAddonDataLua";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { LOOT_ADDON_TALENT_TABS } from "@/games/wow-forever/data/lootAddon/lootAddonTalentTabs";
import { HUB_ZIP_PATHS } from "@/test/addonLua/hubZipPaths";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_LOOT_STUBS } from "@/test/addonLua/wowLootStubs.lua";
import itemEffects from "@/games/wow-forever/data/lootAddon/itemEffects.json";

const ARMOR = "classID = 4";
const CHEST = `loc = "INVTYPE_CHEST", ${ARMOR}, subclassID = 4`;
const RING = `loc = "INVTYPE_FINGER", ${ARMOR}, subclassID = 0`;
const strength = (n: number): string => `stats = { ITEM_MOD_STRENGTH_SHORT = ${n} }`;

const SHOW_ROLL = 'GroupLootFrame1.rollID = 1; GroupLootFrame1.shown = true; fire("START_LOOT_ROLL", 1); tick()';
const COLOUR_CODES = /\|c[0-9a-f]{8}|\|r/gi;
const VERDICT = /^frame: (Upgrade|Downgrade|About the same)/;
const ESTIMATE = /effect is a guess: about (\d+) stats' worth, judging by item level/;
const LEVELING = "Scored with leveling stat values (PvE)";
const ARMS = "Scored for Arms (raid stat values, PvE)";

/** Loads the addon after `setup`, runs `then`, and returns what the roll window and chat showed, colour codes stripped. */
function run(setup: string, then = SHOW_ROLL): string[] {
  return runRaw(setup, then).map((line) => line.replace(COLOUR_CODES, ""));
}

function runRaw(setup: string, then: string): string[] {
  return runAddonLua(
    [
      ["Data.lua", lootAddonDataLua()],
      ["setup", setup],
      ["MGAHub.lua", hubLua],
      ["MGALoot.lua", addonLua],
      ["then", then],
    ],
    WOW_LOOT_STUBS,
  );
}

const roll = (item: string, extra = ""): string => `items[100] = { ${item} }; rolls[1] = 100; talents = { 31, 20, 0 }; ${extra}`;

describe("MGA Loot data", () => {
  it("Data.lua is generated from Item compare's weights", async () => {
    await expect(lootAddonDataLua()).toMatchFileSnapshot("../../addon/MGALoot/Data.lua");
  });

  it("gives every spec a talent tab", () => {
    for (const c of WOW_CLASSES) {
      for (const s of c.specs) expect(LOOT_ADDON_TALENT_TABS[`${c.id}/${s.id}`], `${c.id}/${s.id}`).toBeGreaterThan(0);
    }
  });

  it("loads after MGA Hub, and Data.lua before the addon", () => {
    expect(addonToc).toContain("## Dependencies: MGAHub");
    expect(addonToc).toContain("## SavedVariables: MGALootSettings");
    expect(addonToc).not.toContain("MGAHub.lua");
    expect(addonToc.indexOf("Data.lua")).toBeLessThan(addonToc.indexOf("MGALoot.lua"));
  });

  it("zips the addon inside its folder, MGA Hub beside it", () => {
    const files = unzipSync(lootAddonZip());
    expect(Object.keys(files).sort()).toEqual(["MGALoot/", "MGALoot/Data.lua", "MGALoot/MGALoot.lua", "MGALoot/MGALoot.toc", ...HUB_ZIP_PATHS].sort());
    expect(strFromU8(files["MGALoot/Data.lua"])).toBe(lootAddonDataLua());
  });
});

describe("MGA Loot verdicts", () => {
  it("calls an upgrade on the roll window, with the spec from talents and the bind type", () => {
    const [line] = run(roll(`${CHEST}, bind = 1, ${strength(20)}`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`));
    expect(line).toMatch(/^frame: Upgrade \+100% over .*\[Item 5\]/);
    expect(line).toContain(`${ARMS} // Binds on pickup`);
  });

  it("says its values are PvE next to the spec on every verdict", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, "me.level = 50"))[0]).toContain(LEVELING);
  });

  it("marks a stun proc as worth more in PvP (Dark Iron Pulverizer)", () => {
    const MACE = `loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 5`;
    const [line] = run(
      `items[11608] = { ${MACE}, ${strength(20)}, lines = { "Chance on hit: Stuns target for 2 sec." } }; rolls[1] = 11608; talents = { 31, 20, 0 }; ` +
        `items[16] = { ${MACE}, ${strength(10)} }; equipped[16] = 16`,
    );
    expect(line).toContain("Stunning Blow: control effect: no damage or healing value (worth more in PvP)");
    // A plain damage proc carries no PvP mark.
    const SWORD = `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7`;
    const [fire] = run(`items[1728] = { ${SWORD}, ${strength(10)} }; rolls[1] = 1728; talents = { 31, 20, 0 }`);
    expect(fire).not.toContain("worth more in PvP");
  });

  it("scores Forever's school spell damage (Twisted Shadow Staff vs Zum'rah's Vexing Cane)", () => {
    const STAFF = `loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 10`;
    const [line] = run(
      roll(
        `${STAFF}, stats = { ITEM_MOD_STAMINA_SHORT = 21, ITEM_MOD_SHADOW_DAMAGE_DONE_SHORT = 52 }`,
        `me.class = "WARLOCK"; me.level = 48; items[5] = { ${STAFF}, stats = { ITEM_MOD_STAMINA_SHORT = 10, ITEM_MOD_INTELLECT_SHORT = 10, ITEM_MOD_SPELL_POWER_SHORT = 54 } }; equipped[16] = 5`,
      ),
    );
    // Warlock leveling: staff 21 + 52 x 0.8 = 62.6 vs cane 10 + 7 + 54 x 0.9 = 65.6, -4.6%.
    expect(line).toContain("Downgrade -5% vs");
    expect(line).not.toContain("Can't judge");
  });

  it("calls a downgrade and a sidegrade", () => {
    expect(run(roll(`${CHEST}, ${strength(5)}`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`))[0]).toContain(
      "Downgrade -50% vs",
    );
    expect(run(roll(`${CHEST}, ${strength(10)}`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`))[0]).toContain(
      "About the same as",
    );
  });

  it("calls an empty slot an upgrade", () => {
    expect(run(roll(`${CHEST}, ${strength(1)}`))[0]).toContain("Upgrade: your slot is empty");
  });

  it("compares a ring with the weaker of the two you wear", () => {
    const [line] = run(
      roll(`${RING}, ${strength(15)}`, `items[11] = { ${RING}, ${strength(30)} }; items[12] = { ${RING}, ${strength(10)} }; equipped[11] = 11; equipped[12] = 12`),
    );
    expect(line).toMatch(/Upgrade \+50% over .*\[Item 12\]/);
  });

  it("shows how a ring does against both rings you wear", () => {
    const wearing = `items[11] = { ${RING}, ${strength(30)} }; items[12] = { ${RING}, ${strength(10)} }; equipped[11] = 11; equipped[12] = 12`;
    const better = run(roll(`${RING}, ${strength(15)}`, wearing)).join("\n");
    expect(better).toMatch(/Upgrade \+50% over .*\[Item 12\]\S* \/\/ -50% vs .*\[Item 11\]\S* \(your other one\)/);
    const worse = run(roll(`${RING}, ${strength(8)}`, wearing)).join("\n");
    expect(worse).toMatch(/Downgrade -20% vs .*\[Item 12\]\S* \/\/ -73% vs .*\[Item 11\]\S* \(your other one\)/);
    // Two rings that score the same: one verdict line, the other "About the same" below it.
    const twins = `items[11] = { ${RING}, ${strength(10)} }; items[12] = { ${RING}, ${strength(10)} }; equipped[11] = 11; equipped[12] = 12`;
    expect(run(roll(`${RING}, ${strength(10)}`, twins)).join(" ")).toMatch(/About the same as .*\[Item 11\]\S* \/\/ 0% vs .*\[Item 12\]/);
    // A ring with nothing it scores gets no second line: a % against a zero score means nothing.
    expect(run(roll(`${RING}, stats = {}`, wearing)).join(" ")).not.toContain("your other one");
    // One finger empty: there's no other ring to compare with.
    expect(run(roll(`${RING}, ${strength(15)}`, `items[11] = { ${RING}, ${strength(30)} }; equipped[11] = 11`)).join("\n")).not.toContain("your other one");
  });

  it("won't compare a Unique item you already wear", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}, lines = { "Unique" }`, "equipped[5] = 100"))[0]).toContain(
      "Can't compare: it's unique and you wear one",
    );
  });

  it("compares a second copy of an item that isn't Unique", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, "equipped[5] = 100"))[0]).toContain("About the same as");
    // A ring you already wear, with the other finger empty: the empty finger wins.
    expect(run(roll(`${RING}, ${strength(10)}`, "equipped[11] = 100"))[0]).toContain("Upgrade: your slot is empty");
  });

  it("compares armor with your armor, not your two-hander", () => {
    const [line] = run(
      roll(
        `${CHEST}, ${strength(20)}`,
        `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5; items[16] = { loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 1, ${strength(50)} }; equipped[16] = 16`,
      ),
    );
    expect(line).toMatch(/Upgrade \+100% over .*\[Item 5\]/);
  });

  it("compares a one-hander with your main hand when your off hand holds a shield", () => {
    const [line] = run(
      roll(
        `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7, ${strength(20)}`,
        `items[16] = { loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7, ${strength(10)} }; items[17] = { loc = "INVTYPE_SHIELD", ${ARMOR}, subclassID = 6, ${strength(1)} }; equipped[16] = 16; equipped[17] = 17`,
      ),
    );
    expect(line).toMatch(/Upgrade \+100% over .*\[Item 16\]/);
  });

  it("compares a one-hander with the weaker hand when you dual wield", () => {
    const [line] = run(
      roll(
        `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7, ${strength(20)}`,
        `items[16] = { loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7, ${strength(30)} }; items[17] = { loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7, ${strength(10)} }; equipped[16] = 16; equipped[17] = 17`,
      ),
    );
    expect(line).toMatch(/Upgrade \+100% over .*\[Item 17\]\S* \/\/ -33% vs .*\[Item 16\]\S* \(your other one\)/);
  });

  it("calls 5% an upgrade and 4% about the same", () => {
    const vs100 = (n: number): string =>
      run(roll(`${CHEST}, ${strength(n)}`, `items[5] = { ${CHEST}, ${strength(100)} }; equipped[5] = 5`))[0];
    expect(vs100(105)).toContain("Upgrade +5% over");
    expect(vs100(104)).toContain("About the same as");
    expect(vs100(95)).toContain("Downgrade -5% vs");
  });

  it("scores Classic's hit, crit, dodge, parry and block chance lines with the chance weights", () => {
    const vsTen = (lines: string): string =>
      run(roll(`${CHEST}, ${strength(10)}, lines = { ${lines} }`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`))[0];
    // Arms: 1% hit is worth about as much as 10 strength, so +1% hit roughly doubles a 10-strength chest.
    expect(vsTen('"Equip: Improves your chance to hit by 1%."')).toMatch(/Upgrade \+\d+% over/);
    expect(vsTen('"Equip: Improves your chance to get a critical strike by 1%."')).toMatch(/Upgrade \+\d+% over/);
    expect(vsTen('"Equip: Increases your chance to dodge an attack by 1%."')).not.toContain("Can't judge");
  });

  it("counts a chance once when the game gives it as a stat and a tooltip line", () => {
    const both = run(
      roll(
        `${CHEST}, stats = { ITEM_MOD_STRENGTH_SHORT = 10, ITEM_MOD_HIT_RATING_SHORT = 1 }, lines = { "Equip: Improves your chance to hit by 1%." }`,
        `items[5] = { ${CHEST}, stats = { ITEM_MOD_STRENGTH_SHORT = 10, ITEM_MOD_HIT_RATING_SHORT = 1 } }; equipped[5] = 5`,
      ),
    )[0];
    expect(both).toContain("About the same as");
  });

  it("counts spell damage vs humanoids at the share of mobs your level that are humanoids (Courier's Clasp)", () => {
    const NECK = `loc = "INVTYPE_NECK", ${ARMOR}, subclassID = 0`;
    const [line] = run(
      roll(
        `${NECK}, stats = { ITEM_MOD_INTELLECT_SHORT = 10, ITEM_MOD_SPIRIT_SHORT = 7, ITEM_MOD_SPELL_POWER_SHORT = 8, ITEM_MOD_SPELL_DAMAGE_VS_HUMANOID_SHORT = 10 }`,
        `me.class = "MAGE"; me.level = 44; items[5] = { ${NECK}, stats = { ITEM_MOD_STAMINA_SHORT = 10, ITEM_MOD_INTELLECT_SHORT = 1, ITEM_MOD_SPELL_POWER_SHORT = 12 } }; equipped[2] = 5`,
      ),
    );
    expect(line).toContain("Spell Damage Vs Humanoids counted at 41% (humanoids among mobs your level)");
    expect(line).not.toContain("Can't judge");
  });

  it("scores an item the game gives no stats for as nothing", () => {
    expect(run(roll(`${CHEST}`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`))[0]).toContain("Downgrade -100% vs");
  });

  it("caps the percentage when the worn item scores next to nothing", () => {
    expect(run(roll(`${CHEST}, ${strength(100)}`, `items[5] = { ${CHEST}, ${strength(1)} }; equipped[5] = 5`))[0]).toContain(
      "Upgrade +300%+ over",
    );
  });

  it("says an off-hand weapon is no use without dual wield", () => {
    expect(run(roll(`loc = "INVTYPE_WEAPONOFFHAND", classID = 2, subclassID = 7`, "me.level = 15"))[0]).toContain(
      "Can't use: you can't dual wield",
    );
  });

  it("won't compare an off-hand while you wield a two-hander", () => {
    const [line] = run(
      roll(`loc = "INVTYPE_SHIELD", ${ARMOR}, subclassID = 6, ${strength(10)}`, `items[16] = { loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 1, ${strength(10)} }; equipped[16] = 16`),
    );
    expect(line).toContain("Can't compare: you use a two-hander");
  });

  it("scores a two-hander against main hand and off hand together", () => {
    const [line] = run(
      roll(
        `loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 1, ${strength(40)}`,
        `items[16] = { loc = "INVTYPE_WEAPON", classID = 2, subclassID = 0, ${strength(10)} }; items[17] = { loc = "INVTYPE_SHIELD", ${ARMOR}, subclassID = 6, ${strength(10)} }; equipped[16] = 16; equipped[17] = 17`,
      ),
    );
    expect(line).toContain("Upgrade +100% over");
  });

  it("shows Can't use in red", () => {
    expect(runRaw(roll(`${CHEST}, ${strength(10)}`, 'me.class = "MAGE"'), SHOW_ROLL)[0]).toContain("|cffff6060Can't use:|r");
  });

  it("says what your class can't use", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, 'me.level = 30'))[0]).toContain("Can't use: you can wear Plate from level 40");
    expect(run(roll(`${CHEST}, ${strength(10)}`, 'me.class = "MAGE"'))[0]).toContain("Can't use: your class can't wear Plate");
    expect(run(roll(`loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 6, ${strength(10)}`, 'me.class = "ROGUE"'))[0]).toContain(
      "Can't use: your class can't use this Polearm",
    );
    expect(run(roll(`loc = "INVTYPE_RELIC", ${ARMOR}, subclassID = 8`, 'me.class = "SHAMAN"'))[0]).toContain("Can't use: not for your class");
  });

  it("tags the level an item needs", () => {
    expect(run(roll(`${CHEST}, minLevel = 45, ${strength(10)}`, "me.level = 42"))[0]).toContain("Needs level 45");
  });

  it("uses leveling weights below 60 and marks them an estimate", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, "me.level = 50"))[0]).toContain(LEVELING);
  });

  it("estimates an effect with no data from the item's level: the stat points it lacks next to items like it", () => {
    // Item 100 isn't in MGALootEffects, so the estimate is worked out in game from MGALootBudget.
    const budget = (itemEffects.budget as Record<string, Record<string, Record<string, number>>>).head_chest_legs["3"]["60"];
    const [line] = run(
      roll(`${CHEST}, quality = 3, ilvl = 60, ${strength(10)}, lines = { "Use: Restores 500 health." }`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`),
    );
    expect(line).toMatch(/^frame: Upgrade \+\d+% over .*\[Item 5\]/);
    expect(line.match(ESTIMATE)?.[1]).toBe(String(budget - 10));
    // An item already at its level's budget has nothing left for the effect.
    const [full] = run(
      roll(`${CHEST}, quality = 3, ilvl = 60, ${strength(budget)}, lines = { "Use: Restores 500 health." }`, `items[5] = { ${CHEST}, ${strength(budget)} }; equipped[5] = 5`),
    );
    expect(full).toContain("About the same as");
    expect(full).toContain("This item's Use effect adds little, judging by item level");
    expect(full).not.toContain("0 stats' worth");
  });

  it("estimates an effect on your worn item too", () => {
    const [line] = run(
      roll(`${CHEST}, quality = 3, ${strength(20)}`, `items[5] = { ${CHEST}, quality = 3, ${strength(10)}, lines = { "Chance on hit: Heals you for 50." } }; equipped[5] = 5`),
    );
    // 20 strength beats 10 on stats; the worn item's estimated effect makes it the better one.
    expect(line).toMatch(/^frame: Downgrade -\d+% vs/);
  });

  it("counts a stat it has no weight for at your average stat weight", () => {
    const [line] = run(
      roll(`${CHEST}, stats = { ITEM_MOD_STRENGTH_SHORT = 10, ITEM_MOD_MYSTERY_SHORT = 3 }`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`),
    );
    expect(line).toMatch(VERDICT);
    expect(line).toContain("ITEM_MOD_MYSTERY_SHORT counted like an average stat");
  });

  it("never says Can't judge", () => {
    const SWORD = `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7`;
    const TRINKET = `loc = "INVTYPE_TRINKET", ${ARMOR}, subclassID = 0`;
    const odd = 'lines = { "Use: Restores 500 health.", "Chance on hit: Heals you for 50." }';
    const cases = [
      roll(`${CHEST}, ${strength(10)}, ${odd}`, `items[5] = { ${CHEST}, ${strength(20)}, ${odd} }; equipped[5] = 5`),
      roll(`${CHEST}, stats = {}, ${odd}`, `items[5] = { ${CHEST}, stats = {}, ${odd} }; equipped[5] = 5`),
      roll(`${RING}, ${odd}`, `items[11] = { ${RING}, ${odd} }; items[12] = { ${RING}, ${strength(5)}, ${odd} }; equipped[11] = 11; equipped[12] = 12`),
      roll(`${TRINKET}, quality = 4, ilvl = 63, ${odd}`, `items[13] = { ${TRINKET}, ${odd} }; equipped[13] = 13`),
      roll(`${SWORD}, quality = 5, ilvl = 80, ${odd}`, 'me.class = "MAGE"; me.level = 30'),
      `items[754] = { ${SWORD}, ${strength(10)}, ${odd} }; rolls[1] = 754; talents = { 31, 20, 0 }; items[17780] = { ${SWORD}, ${odd} }; equipped[16] = 17780`,
      roll(`${CHEST}, stats = { ITEM_MOD_MYSTERY_SHORT = 3, ITEM_MOD_MANA_SHORT = 100 }`, `items[5] = { ${CHEST}, stats = { ITEM_MOD_HEALTH_SHORT = 50 } }; equipped[5] = 5`),
    ];
    for (const setup of cases) {
      const text = run(setup).join("\n");
      expect(text, setup).not.toMatch(/can't judge|stats alone|nothing it scores/i);
      expect(text, setup).toMatch(VERDICT);
    }
  });

  it("doesn't count Equip lines that are plain stats as effects", () => {
    const [line] = run(
      roll(
        `${CHEST}, ${strength(10)}, lines = { "Equip: +40 Attack Power.", "Equip: Increased Defense +7.", "Equip: Increases the block value of your shield by 10.", "Equip: Increases healing done by spells and effects by up to 22.", "Equip: Restores 4 mana per 5 sec." }`,
      ),
    );
    expect(line).not.toContain("Can't judge");
  });

  it("scores a weapon's Chance on hit from its effect data, with the note (Teebu's Blazing Longsword)", () => {
    const SWORD = `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7`;
    const [line] = run(
      `items[1728] = { ${SWORD}, ${strength(10)}, lines = { "Chance on hit: Blasts a target for 140 Fire damage." } }; rolls[1] = 1728; talents = { 31, 20, 0 }; ` +
        `items[16] = { ${SWORD}, ${strength(10)} }; equipped[16] = 16`,
    );
    // Arms: 10 strength + 2.333 proc DPS x 5.31 melee = 22.4 vs 10.
    expect(line).toMatch(/Upgrade \+124% over .*\[Item 16\]/);
    expect(line).toContain("+2.3 DPS from this item's proc: 140 Fire dmg at 1 PPM (Classic rate)");
    expect(line).not.toContain("Can't judge");
  });

  it("scores a Use: buff at its average value (Earthstrike), so trinkets get a verdict", () => {
    const TRINKET = `loc = "INVTYPE_TRINKET", ${ARMOR}, subclassID = 0`;
    const [line] = run(
      `items[21180] = { ${TRINKET}, lines = { "Use: Increases your melee and ranged attack power by 280.  Effect lasts for 20 sec." } }; rolls[1] = 21180; talents = { 31, 20, 0 }; ` +
        `items[13] = { ${TRINKET}, ${strength(10)} }; items[14] = { ${TRINKET}, ${strength(30)} }; equipped[13] = 13; equipped[14] = 14`,
    );
    // Arms: 46.667 attack power x 0.45 = 21 vs the weaker trinket's 10 strength.
    expect(line).toMatch(/Upgrade \+110% over .*\[Item 13\]/);
    expect(line).toContain("+46.7 attack power from this item's Use effect: +280 attack power for 20s every 2min");
  });

  it("scores a proc with no rate in the data at the Classic server's own rule (Fiery War Axe)", () => {
    const AXE = `loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 1`;
    const [line] = run(
      `items[870] = { ${AXE}, ${strength(20)}, lines = { "Chance on hit: Hurls a fiery ball that causes 155 to 197 Fire damage." } }; rolls[1] = 870; talents = { 31, 20, 0 }; ` +
        `items[16] = { ${AXE}, ${strength(10)} }; equipped[16] = 16`,
    );
    expect(line).toContain("Upgrade");
    expect(line).toContain("1.08 PPM (Classic server rule)");
    expect(line).not.toContain("Can't judge");
  });

  it("calls a downgrade when only your worn item has the estimated effect and it wins anyway", () => {
    const SWORD = `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7`;
    const [line] = run(
      `items[854] = { ${SWORD} }; rolls[1] = 854; talents = { 31, 20, 0 }; ` +
        `items[754] = { ${SWORD}, ${strength(20)}, lines = { "Chance on hit: Blasts the enemy with Holy Smite." } }; equipped[16] = 754`,
    );
    expect(line).toMatch(/Downgrade -\d+% vs/);
  });

  it("values an effect the data can't model at the generator's item-level estimate (Shortsword of Vengeance)", () => {
    const SWORD = `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7`;
    const SMITE = 'lines = { "Chance on hit: Blasts the enemy with Holy Smite." }';
    const [up] = run(
      `items[754] = { ${SWORD}, ${strength(20)}, ${SMITE} }; rolls[1] = 754; talents = { 31, 20, 0 }; items[16] = { ${SWORD}, ${strength(10)} }; equipped[16] = 16`,
    );
    expect(up).toMatch(/Upgrade \+\d+% over/);
    expect(up).toContain("This item's Holy Smite is a guess: about 14 stats' worth, judging by item level");
    // The guess line names the effect, so its "the data can't ..." note isn't repeated.
    expect(up).not.toContain("the data gives no proc rate");
    // 10 strength + 14 points of effect beats a plain 20 strength sword.
    const [weaker] = run(
      `items[754] = { ${SWORD}, ${strength(10)}, ${SMITE} }; rolls[1] = 754; talents = { 31, 20, 0 }; items[16] = { ${SWORD}, ${strength(20)} }; equipped[16] = 16`,
    );
    expect(weaker).toMatch(VERDICT);
    expect(weaker).toContain("This item's Holy Smite is a guess: about 14 stats' worth, judging by item level");
  });

  it("counts Zum'rah's Vexing Cane's summon for a caster, with its summon note", () => {
    const STAFF = `loc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 10`;
    const STATS = "stats = { ITEM_MOD_STAMINA_SHORT = 20, ITEM_MOD_SPELL_POWER_SHORT = 40 }";
    const CANE = `items[18082] = { ${STAFF}, ${STATS}, lines = { "Equip: Chance on harmful spell cast to summon a Zombie Troll of Zum'rah for 20 sec." } }; rolls[1] = 18082; `;
    const WORN = `items[16] = { ${STAFF}, ${STATS} }; equipped[16] = 16`;
    const [warlock] = run(`${CANE}me.class = "WARLOCK"; me.level = 45; talents = { 31, 20, 0 }; ${WORN}`);
    expect(warlock).toMatch(/Upgrade \+\d+% over/);
    expect(warlock).toContain("summons Zombie Troll of Zum'rah for 20s");
    expect(warlock).not.toContain("Can't judge");
    // A warrior weighs spell damage at nothing, so the zombie adds nothing for him.
    const [warrior] = run(`${CANE}me.level = 45; talents = { 31, 20, 0 }; ${WORN}`);
    expect(warrior).toContain("About the same");
  });

  it("counts a change to class spells only for that class (Zandalarian Shadow Mastery Talisman's Kick)", () => {
    const TRINKET = `loc = "INVTYPE_TRINKET", ${ARMOR}, subclassID = 0`;
    const TALISMAN = `items[19617] = { ${TRINKET}, ${strength(10)} }; rolls[1] = 19617; talents = { 31, 20, 0 }; `;
    const WORN = `items[13] = { ${TRINKET}, ${strength(10)} }; items[14] = { ${TRINKET}, ${strength(10)} }; equipped[13] = 13; equipped[14] = 14`;
    const [rogue] = run(`${TALISMAN}me.class = "ROGUE"; ${WORN}`);
    expect(rogue).toContain("DPS from Improved Kick: Kick");
    expect(rogue).not.toContain("only helps rogues");
    expect(rogue).not.toContain("About the same");
    const [warrior] = run(`${TALISMAN}${WORN}`);
    expect(warrior).toContain("Improved Kick only helps rogues, so it counts 0");
    expect(warrior).toContain("About the same");
    expect(warrior).not.toContain("judging by item level");
  });

  it("scores a plain stat line GetItemStats doesn't give (Gemburst Circlet vs Dreamweave Circlet)", () => {
    const HEAD = `loc = "INVTYPE_HEAD", ${ARMOR}, subclassID = 1`;
    const GEMBURST = `items[7] = { ${HEAD}, quality = 2, ilvl = 30, stats = { RESISTANCE0_NAME = 48, ITEM_MOD_INTELLECT_SHORT = 8 }, lines = { "Equip: Increases healing done by up to 13 and damage done by up to 4 for all magical spells and effects." } }; rolls[1] = 7; `;
    const DREAMWEAVE = `items[10041] = { ${HEAD}, stats = { RESISTANCE0_NAME = 58, ITEM_MOD_INTELLECT_SHORT = 10, ITEM_MOD_SPIRIT_SHORT = 12 }, lines = { "Equip: Increases damage and healing done by magical spells and effects by up to 21." } }; equipped[1] = 10041`;
    const [line] = run(`${GEMBURST}me.class = "PRIEST"; me.level = 40; talents = { 0, 31, 20 }; ${DREAMWEAVE}`);
    expect(line).toMatch(VERDICT);
    // Read from the text, the line is scored exactly: no item-level guess, no "Can't judge".
    expect(line).not.toContain("Can't judge");
    expect(line).not.toContain("judging by item level");
  });

  it("shows at most three grey lines, one fact each, biggest first, and /mgaloot check shows them all", () => {
    const ODD = "stats = { ITEM_MOD_STRENGTH_SHORT = 10, ITEM_MOD_MYSTERY_SHORT = 3, ITEM_MOD_ODD_SHORT = 1 }";
    const setup = `items[100] = { ${CHEST}, bind = 1, ${ODD} }; rolls[1] = 100; talents = { 31, 0, 0 }; items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`;
    const [line] = run(setup);
    const grey = line.split(" // ").slice(1);
    expect(grey).toEqual([ARMS, "ITEM_MOD_MYSTERY_SHORT counted like an average stat", "+2 more with /mgaloot check"]);
    expect(line).not.toContain(" · ");
    const all = run(setup, 'SlashCmdList.MGALOOT("check " .. link(100))');
    expect(all.slice(1)).toEqual([
      `chat: MGA Loot: ${ARMS}`,
      "chat: MGA Loot: ITEM_MOD_MYSTERY_SHORT counted like an average stat",
      "chat: MGA Loot: ITEM_MOD_ODD_SHORT counted like an average stat",
      "chat: MGA Loot: Binds on pickup",
    ]);
  });

  it("never counts a tooltip stat line twice when GetItemStats gives the same stat", () => {
    const HEAD = `loc = "INVTYPE_HEAD", ${ARMOR}, subclassID = 1`;
    const HEALING = "stats = { RESISTANCE0_NAME = 40, ITEM_MOD_SPELL_HEALING_DONE_SHORT = 22 }";
    const [line] = run(
      `items[7] = { ${HEAD}, ${HEALING}, lines = { "Equip: Increases healing done by spells and effects by up to 22." } }; rolls[1] = 7; ` +
        `me.class = "PRIEST"; me.level = 40; talents = { 0, 31, 20 }; items[1] = { ${HEAD}, ${HEALING} }; equipped[1] = 1`,
    );
    expect(line).toContain("About the same");
    expect(line).not.toContain("judging by item level");
  });

  it("turns armor off the target into a share of weapon DPS against mobs your level", () => {
    const SWORD = `loc = "INVTYPE_WEAPON", classID = 2, subclassID = 7`;
    const sword = (id: number): string => `items[${id}] = { ${SWORD}, stats = { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 40 } }`;
    const [line] = run(
      `${sword(13286)}; items[13286].lines = { "Chance on hit: Reduces the target's armor by 100 for 30 sec." }; rolls[1] = 13286; me.level = 50; talents = { 31, 20, 0 }; ` +
        `${sword(16)}; equipped[16] = 16`,
    );
    expect(line).toMatch(/Upgrade|About the same/);
    expect(line).toMatch(/-50 armor on average, worth \+[\d.]+% weapon DPS vs 3271 armor \(normal mobs your level\)/);
    expect(line).not.toContain("Can't judge");
  });

  it("notes an effect with no combat value and judges the rest (Water Breathing)", () => {
    const [line] = run(
      `items[9452] = { ${CHEST}, ${strength(20)}, lines = { "Equip: Allows underwater breathing." } }; rolls[1] = 9452; talents = { 31, 20, 0 }; ` +
        `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`,
    );
    expect(line).toMatch(/Upgrade \+100% over .*\[Item 5\]/);
    expect(line).toContain("Water Breathing: no combat value");
  });

  it("says nothing about items that aren't gear", () => {
    expect(run(roll(`loc = "", classID = 0, subclassID = 0`))).toEqual([]);
  });

  it("waits for item info the client hasn't loaded, then shows the verdict", () => {
    const lines = run(
      roll(`${CHEST}, loading = true, ${strength(10)}`),
      `${SHOW_ROLL}; items[100].loading = false; fire("GET_ITEM_INFO_RECEIVED", 100)`,
    );
    expect(lines[0]).toBe("frame: Checking the item...");
    expect(lines[1]).toContain("Upgrade: your slot is empty");
  });

  it("falls back to chat when it can't find the roll window", () => {
    const [line] = run(roll(`${CHEST}, ${strength(10)}`), 'fire("START_LOOT_ROLL", 1); tick()');
    expect(line).toMatch(/^chat: MGA Loot: .*\[Item 100\].* Upgrade: your slot is empty — Scored for Arms \(raid stat values, PvE\)$/);
  });

  it("finds the roll window when it shows after the event", () => {
    const then = 'fire("START_LOOT_ROLL", 1); GroupLootFrame1.rollID = 1; GroupLootFrame1.shown = true; tick()';
    expect(run(roll(`${CHEST}, ${strength(10)}`), then)[0]).toBe(`frame: Upgrade: your slot is empty // ${ARMS}`);
  });

  it("finds roll windows in the newer loot UI", () => {
    const setup = roll(`${CHEST}, ${strength(10)}`, "GroupLootFrame1 = nil; GroupLootContainer = { rollFrames = { rollWindow(1) } }");
    expect(run(setup, 'fire("START_LOOT_ROLL", 1); tick()')[0]).toBe(`frame: Upgrade: your slot is empty // ${ARMS}`);
  });

  it("says nothing about a roll that ended before its verdict was ready", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`), 'fire("START_LOOT_ROLL", 1); fire("CANCEL_LOOT_ROLL", 1); tick()')).toEqual([]);
    const then = `${SHOW_ROLL}; fire("CANCEL_LOOT_ROLL", 1); items[100].loading = false; fire("GET_ITEM_INFO_RECEIVED", 100)`;
    expect(run(roll(`${CHEST}, loading = true, ${strength(10)}`), then)).toEqual(["frame: Checking the item..."]);
  });

  it("reads talent points from either GetTalentTabInfo shape", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, 'talentShape = "retail"; talents = { 0, 0, 31 }'))[0]).toContain("Scored for Protection (raid stat values, PvE)");
  });

  it("works with a global GetItemInfo instead of C_Item's", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, "GetItemInfo = C_Item.GetItemInfo; C_Item = nil"))[0]).toContain(
      "Upgrade: your slot is empty",
    );
  });

  it("says so when the client gives addons no item stats", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, "GetItemStats = nil"))[0]).toBe(
      "frame: Can't compare: this client doesn't give addons item stats",
    );
  });

  it("uses the spec saved from last session, which the game loads after the addon", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`), `MGALootSettings = { spec = "fury" }; ${SHOW_ROLL}`)[0]).toContain("Scored for Fury (raid stat values, PvE)");
  });
});

describe("MGA Loot slash command", () => {
  const slash = (msg: string): string => `SlashCmdList.MGALOOT(${JSON.stringify(msg)})`;

  it("sets the spec, which then labels verdicts", () => {
    const lines = run(roll(`${CHEST}, ${strength(10)}`), `${slash("spec protection")}; SlashCmdList.MGALOOT("check " .. link(100))`);
    expect(lines[0]).toBe("chat: MGA Loot: spec: Protection.");
    expect(lines[2]).toBe("chat: MGA Loot: Scored for Protection (raid stat values, PvE)");
  });

  it("lists the specs when given one it doesn't know", () => {
    expect(run("", slash("spec tank"))[0]).toBe("chat: MGA Loot: pick one of: arms, fury, protection, or auto.");
  });

  it("checks an item link without a roll", () => {
    const lines = run(roll(`${CHEST}, ${strength(10)}`), `${slash("check")}; SlashCmdList.MGALOOT("check " .. link(100))`);
    expect(lines[0]).toBe("chat: MGA Loot: put an item link after /mgaloot check.");
    // Each grey line is its own chat line, all of them (no cap).
    expect(lines[1]).toMatch(/^chat: MGA Loot: .*\[Item 100\].* Upgrade: your slot is empty$/);
    expect(lines[2]).toBe(`chat: MGA Loot: ${ARMS}`);
  });

  it("asks to check again an item the game hasn't loaded", () => {
    expect(run(roll(`${CHEST}, loading = true`), 'SlashCmdList.MGALOOT("check " .. link(100))')[0]).toMatch(
      /^chat: MGA Loot: the game hasn't loaded .*\[Item 100\].* yet: check it again in a moment\.$/,
    );
  });

  it("reports the weights it's using, and the spec only at 60", () => {
    expect(run("me.level = 30", slash(""))[0]).toBe("chat: MGA Loot: level 30 warrior, scored with leveling stat values (PvE).");
    expect(run("talents = { 31, 0, 0 }", slash(""))[0]).toBe("chat: MGA Loot: level 60 warrior, scored for Arms (raid stat values, PvE). Spec: auto from talents.");
  });
});

describe("MGA Loot on item tooltips", () => {
  const WORN_CHEST = `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`;
  const setup = (extra = ""): string => `items[100] = { ${CHEST}, bind = 2, minLevel = 61, ${strength(20)} }; talents = { 31, 0, 0 }; ${WORN_CHEST}; ${extra}`;

  it("adds the verdict to a hovered item, without the binding and level the tooltip already shows", () => {
    const lines = run(setup(), "hover(100)");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^GameTooltip: MGA Loot: Upgrade \+100% over .*\[Item 5\]/);
    expect(lines[1]).toBe(`GameTooltip: ${ARMS}`);
  });

  it("adds it once per tooltip show however many hooks fire, and again for the next show", () => {
    const lines = run(setup(`items[101] = { ${CHEST}, ${strength(5)} }`), "hover(100); refire(100); hover(101)");
    expect(lines.filter((l) => l.includes("MGA Loot:"))).toHaveLength(2);
    expect(lines[lines.length - 2]).toContain("Downgrade -50% vs");
  });

  it("says nothing on the item you're wearing", () => {
    expect(run(setup(), "hover(5)")).toEqual([]);
  });

  it("says nothing on items that aren't gear, or that the game hasn't loaded", () => {
    expect(run(setup(`items[200] = { loc = "" }; items[201] = { ${CHEST}, loading = true }`), "hover(200); hover(201)")).toEqual([]);
  });

  it("uses the tooltip's full link, so a random-suffix item is scored as itself", () => {
    const lines = run(setup(`items[300] = { ${CHEST}, ${strength(5)} }`), 'hover(100, link(300))');
    expect(lines[0]).toContain("Downgrade -50% vs");
  });

  it("adds it once to a chat link clicked open, though the hooks see a full link and a raw item string", () => {
    const lines = run(setup(), "clickLink(100)");
    expect(lines.filter((l) => l.includes("MGA Loot:"))).toEqual([expect.stringMatching(/^ItemRefTooltip: MGA Loot: Upgrade \+100%/)]);
  });

  it("adds it once on clients that also fire OnTooltipSetItem", () => {
    expect(run(`setItemScript = true; ${setup()}`, "hover(100)").filter((l) => l.includes("MGA Loot:"))).toHaveLength(1);
  });

  it("knows an item you wear from a chat link's raw item string", () => {
    expect(run(setup(), "clickLink(5)")).toEqual([]);
  });

  it("tries again in the same show when the item loads after the first hook", () => {
    const lines = run(setup(`items[201] = { ${CHEST}, ${strength(20)}, loading = true }`), "hover(201); items[201].loading = nil; refire(201)");
    expect(lines[0]).toMatch(/^GameTooltip: MGA Loot: Upgrade \+100%/);
  });

  it("says Can't use on a tooltip too", () => {
    expect(run(setup(`items[400] = { loc = "INVTYPE_CHEST", ${ARMOR}, subclassID = 4, ${strength(5)} }; me.class = "MAGE"`), "hover(400)")[0]).toBe(
      "GameTooltip: MGA Loot: Can't use: your class can't wear Plate",
    );
  });

  it("can be turned off and on, and remembers it", () => {
    const lines = run(setup(), 'SlashCmdList.MGALOOT("tooltip off"); hover(100); SlashCmdList.MGALOOT("tooltip on"); hover(100)');
    expect(lines[0]).toBe("chat: MGA Loot: tooltip verdicts off.");
    expect(lines[1]).toBe("chat: MGA Loot: tooltip verdicts on.");
    expect(lines[2]).toMatch(/^GameTooltip: MGA Loot: Upgrade/);
    expect(run(setup(), 'MGALootSettings = { tooltip = false }; hover(100)')).toEqual([]);
  });
});

describe("/mgaloot bags", () => {
  const bagsSetup = (bags: string, extra = ""): string =>
    `talents = { 31, 0, 0 }; items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5; ` +
    `items[11] = { ${RING}, ${strength(10)} }; equipped[11] = 11; ` +
    `items[100] = { ${CHEST}, ${strength(12)} }; items[101] = { ${CHEST}, ${strength(30)}, minLevel = 61 }; ` +
    `items[102] = { ${CHEST}, ${strength(5)} }; items[103] = { ${RING}, ${strength(3)} }; items[104] = { loc = "" }; ${extra}; bagItems = ${bags}`;
  const bags = 'SlashCmdList.MGALOOT("bags")';

  it("lists the upgrades across every bag, biggest first, once each, with the level they need", () => {
    const lines = run(bagsSetup("{ [0] = { 100, 102, 104 }, [2] = { 101, 103, 100 } }"), bags);
    expect(lines[0]).toBe("chat: MGA Loot: upgrades in your bags, scored for Arms (raid stat values, PvE):");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/\[Item 103\].* Upgrade: your slot is empty$/);
    expect(lines[2]).toMatch(/\[Item 101\].* Upgrade \+200% over .*\[Item 5\].* \(needs level 61\)$/);
    expect(lines[3]).toMatch(/\[Item 100\].* Upgrade \+20% over .*\[Item 5\].*$/);
  });

  it("says when nothing is an upgrade", () => {
    expect(run(bagsSetup("{ [0] = { 102, 104 } }"), bags)).toEqual(["chat: MGA Loot: nothing in your bags is an upgrade, scored for Arms (raid stat values, PvE)."]);
  });

  it("counts items the game hasn't loaded yet", () => {
    const lines = run(bagsSetup("{ [0] = { 100, 105 } }", `items[105] = { ${CHEST}, loading = true }`), bags);
    expect(lines[lines.length - 1]).toBe("chat: MGA Loot: 1 more still loading: open it again from the MGA menu in a moment.");
  });

  it("reads bags with the older global API too, and says so when there is none", () => {
    const old =
      "GetContainerNumSlots = C_Container.GetContainerNumSlots; GetContainerItemLink = C_Container.GetContainerItemLink; C_Container = nil";
    expect(run(bagsSetup("{ [0] = { 100 } }", old), bags)[1]).toMatch(/\[Item 100\].* Upgrade \+20%/);
    expect(run(bagsSetup("{ [0] = { 100 } }", "C_Container = nil"), bags)).toEqual([
      "chat: MGA Loot: this client doesn't let addons read your bags.",
    ]);
  });
});

describe("MGA Loot in the MGA hub", () => {
  const open = `fire("PLAYER_LOGIN"); MGAHub.OpenMenu()`;

  it("adds Upgrades in your bags under a Loot heading", () => {
    expect(run("", `${open}; table.insert(out, table.concat(menuLines(), " | "))`).slice(-1)[0]).toBe("[Loot] | Upgrades in your bags | - | Settings");
  });

  it("saves the spec and tooltip choices in the same settings the slash command does", () => {
    const viaSettings = run("", `fire("PLAYER_LOGIN"); click(MGALootOptions_spec); clickRow("Arms"); click(MGALootOptions_tooltip); table.insert(out, tostring(MGALootSettings.spec) .. " " .. tostring(MGALootSettings.tooltip))`);
    const viaSlash = run("", `SlashCmdList.MGALOOT("spec arms"); SlashCmdList.MGALOOT("tooltip off"); table.insert(out, tostring(MGALootSettings.spec) .. " " .. tostring(MGALootSettings.tooltip))`);
    expect(viaSettings.slice(-1)[0]).toBe("arms false");
    expect(viaSlash.slice(-1)[0]).toBe("arms false");
  });
});
