import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { lootAddonZip } from "@/games/wow-forever/lib/lootAddon/lootAddonZip";
import addonLua from "../../addon/MGALoot/MGALoot.lua?raw";
import addonToc from "../../addon/MGALoot/MGALoot.toc?raw";
import { lootAddonDataLua } from "@/games/wow-forever/lib/lootAddon/lootAddonDataLua";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { LOOT_ADDON_TALENT_TABS } from "@/games/wow-forever/data/lootAddon/lootAddonTalentTabs";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_LOOT_STUBS } from "@/test/addonLua/wowLootStubs.lua";

const ARMOR = "classID = 4";
const CHEST = `loc = "INVTYPE_CHEST", ${ARMOR}, subclassID = 4`;
const RING = `loc = "INVTYPE_FINGER", ${ARMOR}, subclassID = 0`;
const strength = (n: number): string => `stats = { ITEM_MOD_STRENGTH_SHORT = ${n} }`;

const SHOW_ROLL = 'GroupLootFrame1.rollID = 1; GroupLootFrame1.shown = true; fire("START_LOOT_ROLL", 1); tick()';
const COLOUR_CODES = /\|c[0-9a-f]{8}|\|r/gi;

/** Loads the addon after `setup`, runs `then`, and returns what the roll window and chat showed, colour codes stripped. */
function run(setup: string, then = SHOW_ROLL): string[] {
  return runRaw(setup, then).map((line) => line.replace(COLOUR_CODES, ""));
}

function runRaw(setup: string, then: string): string[] {
  return runAddonLua(
    [
      ["Data.lua", lootAddonDataLua()],
      ["setup", setup],
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

  it("loads Data.lua before the addon", () => {
    expect(addonToc.indexOf("Data.lua")).toBeLessThan(addonToc.indexOf("MGALoot.lua"));
  });

  it("zips the addon inside its folder", () => {
    const files = unzipSync(lootAddonZip());
    expect(Object.keys(files).sort()).toEqual(["MGALoot/", "MGALoot/Data.lua", "MGALoot/MGALoot.lua", "MGALoot/MGALoot.toc"]);
    expect(strFromU8(files["MGALoot/Data.lua"])).toBe(lootAddonDataLua());
  });
});

describe("MGA Loot verdicts", () => {
  it("calls an upgrade on the roll window, with the spec from talents and the bind type", () => {
    const [line] = run(roll(`${CHEST}, bind = 1, ${strength(20)}`, `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`));
    expect(line).toMatch(/^frame: Upgrade \+100% over .*\[Item 5\]/);
    expect(line).toContain("as Arms · binds on pickup");
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
    expect(line).toMatch(/Upgrade \+100% over .*\[Item 17\]/);
  });

  it("calls 5% an upgrade and 4% about the same", () => {
    const vs100 = (n: number): string =>
      run(roll(`${CHEST}, ${strength(n)}`, `items[5] = { ${CHEST}, ${strength(100)} }; equipped[5] = 5`))[0];
    expect(vs100(105)).toContain("Upgrade +5% over");
    expect(vs100(104)).toContain("About the same as");
    expect(vs100(95)).toContain("Downgrade -5% vs");
  });

  it("counts Classic's dodge, parry and block chance lines as chance, not effects", () => {
    const [line] = run(roll(`${CHEST}, ${strength(10)}, lines = { "Equip: Increases your chance to dodge an attack by 1%." }`));
    expect(line).toContain("hit/crit/dodge chances not scored");
    expect(line).not.toContain("has effects");
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
    expect(run(roll(`${CHEST}, minLevel = 45, ${strength(10)}`, "me.level = 42"))[0]).toContain("needs level 45");
  });

  it("uses leveling weights below 60 and marks them an estimate", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, "me.level = 50"))[0]).toContain("leveling estimate");
  });

  it("lists stats and effects it can't score", () => {
    const [line] = run(
      roll(`${CHEST}, stats = { ITEM_MOD_STRENGTH_SHORT = 10, ITEM_MOD_HIT_RATING_SHORT = 1 }, lines = { "Equip: Improves your chance to hit by 1%." }`),
    );
    expect(line).toContain("hit/crit/dodge chances not scored");
    expect(line).toContain("not scored: Hit Rating");
    expect(line).not.toContain("has effects");
  });

  it("flags Use and proc effects, but not Equip lines that are plain stats", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}, lines = { "Use: Restores 500 health." }`))[0]).toContain(
      "has effects it can't score: read the tooltip",
    );
    const [line] = run(
      roll(
        `${CHEST}, ${strength(10)}, lines = { "Equip: +40 Attack Power.", "Equip: Increased Defense +7.", "Equip: Increases the block value of your shield by 10.", "Equip: Increases healing done by spells and effects by up to 22.", "Equip: Restores 4 mana per 5 sec." }`,
      ),
    );
    expect(line).not.toContain("not scored");
    expect(line).not.toContain("can't score");
  });

  it("leaves trinkets to their effect", () => {
    expect(run(roll(`loc = "INVTYPE_TRINKET", ${ARMOR}, subclassID = 0, ${strength(10)}`))[0]).toContain("Trinket: judge it by its effect");
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
    expect(line).toMatch(/^chat: MGA Loot: .*\[Item 100\].* Upgrade: your slot is empty — as Arms$/);
  });

  it("finds the roll window when it shows after the event", () => {
    const then = 'fire("START_LOOT_ROLL", 1); GroupLootFrame1.rollID = 1; GroupLootFrame1.shown = true; tick()';
    expect(run(roll(`${CHEST}, ${strength(10)}`), then)[0]).toBe("frame: Upgrade: your slot is empty // as Arms");
  });

  it("finds roll windows in the newer loot UI", () => {
    const setup = roll(`${CHEST}, ${strength(10)}`, "GroupLootFrame1 = nil; GroupLootContainer = { rollFrames = { rollWindow(1) } }");
    expect(run(setup, 'fire("START_LOOT_ROLL", 1); tick()')[0]).toBe("frame: Upgrade: your slot is empty // as Arms");
  });

  it("says nothing about a roll that ended before its verdict was ready", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`), 'fire("START_LOOT_ROLL", 1); fire("CANCEL_LOOT_ROLL", 1); tick()')).toEqual([]);
    const then = `${SHOW_ROLL}; fire("CANCEL_LOOT_ROLL", 1); items[100].loading = false; fire("GET_ITEM_INFO_RECEIVED", 100)`;
    expect(run(roll(`${CHEST}, loading = true, ${strength(10)}`), then)).toEqual(["frame: Checking the item..."]);
  });

  it("reads talent points from either GetTalentTabInfo shape", () => {
    expect(run(roll(`${CHEST}, ${strength(10)}`, 'talentShape = "retail"; talents = { 0, 0, 31 }'))[0]).toContain("as Protection");
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
    expect(run(roll(`${CHEST}, ${strength(10)}`), `MGALootSettings = { spec = "fury" }; ${SHOW_ROLL}`)[0]).toContain("as Fury");
  });
});

describe("MGA Loot slash command", () => {
  const slash = (msg: string): string => `SlashCmdList.MGALOOT(${JSON.stringify(msg)})`;

  it("sets the spec, which then labels verdicts", () => {
    const lines = run(roll(`${CHEST}, ${strength(10)}`), `${slash("spec protection")}; SlashCmdList.MGALOOT("check " .. link(100))`);
    expect(lines[0]).toBe("chat: MGA Loot: spec: Protection.");
    expect(lines[1]).toContain("as Protection");
  });

  it("lists the specs when given one it doesn't know", () => {
    expect(run("", slash("spec tank"))[0]).toBe("chat: MGA Loot: pick one of: arms, fury, protection, or auto.");
  });

  it("checks an item link without a roll", () => {
    const lines = run(roll(`${CHEST}, ${strength(10)}`), `${slash("check")}; SlashCmdList.MGALOOT("check " .. link(100))`);
    expect(lines[0]).toBe("chat: MGA Loot: put an item link after /mgaloot check.");
    expect(lines[1]).toMatch(/^chat: MGA Loot: .*\[Item 100\].* Upgrade: your slot is empty — as Arms$/);
  });

  it("asks to check again an item the game hasn't loaded", () => {
    expect(run(roll(`${CHEST}, loading = true`), 'SlashCmdList.MGALOOT("check " .. link(100))')[0]).toMatch(
      /^chat: MGA Loot: the game hasn't loaded .*\[Item 100\].* yet: check it again in a moment\.$/,
    );
  });

  it("reports the weights it's using, and the spec only at 60", () => {
    expect(run("me.level = 30", slash(""))[0]).toBe("chat: MGA Loot: level 30 warrior, leveling estimate.");
    expect(run("talents = { 31, 0, 0 }", slash(""))[0]).toBe("chat: MGA Loot: level 60 warrior, as Arms. Spec: auto from talents.");
  });
});

describe("MGA Loot on item tooltips", () => {
  const WORN_CHEST = `items[5] = { ${CHEST}, ${strength(10)} }; equipped[5] = 5`;
  const setup = (extra = ""): string => `items[100] = { ${CHEST}, bind = 2, minLevel = 61, ${strength(20)} }; talents = { 31, 0, 0 }; ${WORN_CHEST}; ${extra}`;

  it("adds the verdict to a hovered item, without the binding and level the tooltip already shows", () => {
    const lines = run(setup(), "hover(100)");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^GameTooltip: MGA Loot: Upgrade \+100% over .*\[Item 5\]/);
    expect(lines[1]).toBe("GameTooltip: as Arms");
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
    expect(lines[0]).toBe("chat: MGA Loot: upgrades in your bags (as Arms):");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/\[Item 103\].* Upgrade: your slot is empty$/);
    expect(lines[2]).toMatch(/\[Item 101\].* Upgrade \+200% over .*\[Item 5\].* \(needs level 61\)$/);
    expect(lines[3]).toMatch(/\[Item 100\].* Upgrade \+20% over .*\[Item 5\].*$/);
  });

  it("says when nothing is an upgrade", () => {
    expect(run(bagsSetup("{ [0] = { 102, 104 } }"), bags)).toEqual(["chat: MGA Loot: nothing in your bags is an upgrade (as Arms)."]);
  });

  it("counts items the game hasn't loaded yet", () => {
    const lines = run(bagsSetup("{ [0] = { 100, 105 } }", `items[105] = { ${CHEST}, loading = true }`), bags);
    expect(lines[lines.length - 1]).toBe("chat: MGA Loot: 1 more still loading: run /mgaloot bags again in a moment.");
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
