import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import addonLua from "../../addon/MGABuffs/MGABuffs.lua?raw";
import addonToc from "../../addon/MGABuffs/MGABuffs.toc?raw";
import { buffsAddonZip } from "@/games/wow-forever/lib/buffsAddon/buffsAddonZip";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_BUFF_STUBS } from "@/test/addonLua/wowBuffStubs.lua";

const MAJOR_SOULSTONE = 16896;
const SOULSTONE_BUFF = 20765;
const ARMORED = 'units.player.buffs = { buff("Demon Armor", now + 1200) }';
const FED = 'table.insert(units.player.buffs, buff("Well Fed", now + 600))';
const STONE_IN_BAGS = `bags[0] = { ${MAJOR_SOULSTONE} }`;

const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/\|c[0-9a-f]{8}|\|r/g, ""));

/** Runs `setup`, loads the addon, logs in, then runs `then`; returns what was drawn, flashed and said after login (or after `then` when it clears), colour codes stripped. */
function run(setup: string, then = ""): string[] {
  return plain(runAddonLua(
    [
      ["setup", setup],
      ["MGABuffs.lua", addonLua],
      ["then", `clear(); fire("PLAYER_LOGIN"); ${then}`],
    ],
    WOW_BUFF_STUBS,
  ));
}

const rows = (lines: string[]): string[] => lines.filter((l) => l.startsWith("row: ")).map((l) => l.slice(5));

describe("MGA Buffs files", () => {
  it("loads the addon from its toc, on the Forever interface", () => {
    expect(addonToc).toContain("## Interface: 16001");
    expect(addonToc).toContain("## SavedVariables: MGABuffsSettings");
    expect(addonToc.trim().split(/\r?\n/).slice(-1)[0]).toBe("MGABuffs.lua");
  });

  it("zips the addon inside its folder", () => {
    const files = unzipSync(buffsAddonZip());
    expect(Object.keys(files).sort()).toEqual(["MGABuffs/", "MGABuffs/MGABuffs.lua", "MGABuffs/MGABuffs.toc"]);
    expect(strFromU8(files["MGABuffs/MGABuffs.lua"])).toBe(addonLua);
  });
});

describe("MGA Buffs armor", () => {
  it("flags a Warlock with no armor, no Soulstone and no food, flashing each once with a sound", () => {
    const lines = run("");
    expect(rows(lines)).toEqual(["No Demon Armor", "No Soulstone in your bags: Create Soulstone", "Not Well Fed: eat buff food"]);
    expect(lines.filter((l) => l.startsWith("flash: "))).toHaveLength(3);
    expect(lines.filter((l) => l === "sound")).toHaveLength(3);
  });

  it("says Demon Skin before level 20, and skips the Soulstone before 18", () => {
    expect(rows(run(`units.player.level = 15; ${FED}`))).toEqual(["No Demon Skin"]);
  });

  it("warns when the armor has 3 minutes or less left, not before", () => {
    expect(rows(run(`units.player.buffs = { buff("Demon Armor", now + 150) }; ${FED}; ${STONE_IN_BAGS}; cooldowns[${MAJOR_SOULSTONE}] = { start = now, duration = 1800 }`))).toEqual([
      "Demon Armor: 3 min left",
    ]);
    expect(rows(run(`units.player.buffs = { buff("Demon Armor", now + 181) }; ${FED}; ${STONE_IN_BAGS}; cooldowns[${MAJOR_SOULSTONE}] = { start = now, duration = 1800 }`))).toEqual([]);
    expect(rows(run(`units.player.buffs = { buff("Demon Armor", now + 30) }; ${FED}; units.player.level = 15`))).toEqual([
      "Demon Armor: under a minute left",
    ]);
  });

  it("knows a Mage's armor spells and a Priest's Inner Fire", () => {
    expect(rows(run(`units.player = unit("MAGE", 60, "Me"); ${FED}; table.insert(units.player.buffs, buff("Arcane Brilliance"))`))).toEqual([
      "No Frost, Ice or Mage Armor",
    ]);
    expect(rows(run(`units.player = unit("MAGE", 60, "Me"); ${FED}; table.insert(units.player.buffs, buff("Ice Armor", now + 900)); table.insert(units.player.buffs, buff("Arcane Intellect", now + 900))`))).toEqual([]);
    expect(rows(run(`units.player = unit("PRIEST", 11, "Me"); ${FED}; table.insert(units.player.buffs, buff("Power Word: Fortitude"))`))).toEqual([]);
  });
});

describe("MGA Buffs Soulstone", () => {
  const ready = `${ARMORED}; ${FED}; ${STONE_IN_BAGS}`;

  it("says a ready stone in your bags should go on you when solo, on someone in a group", () => {
    expect(rows(run(ready))).toEqual(["Soulstone ready: put it on yourself"]);
    expect(rows(run(`${ready}; group = "party"; units.party1 = unit("WARRIOR", 60, "Bob", { power = 1 })`))).toEqual([
      "Soulstone ready: put it on someone",
    ]);
  });

  it("stays quiet while the stone is on cooldown", () => {
    expect(rows(run(`${ready}; cooldowns[${MAJOR_SOULSTONE}] = { start = now - 60, duration = 1800 }`))).toEqual([]);
  });

  it("warns when your Soulstone on a groupmate is about to run out", () => {
    const party = `${ready}; group = "party"; units.party1 = unit("WARRIOR", 60, "Bob", { power = 1 })`;
    const onBob = (expires: string, source = "player") =>
      `${party}; units.party1.buffs = { buff("Soulstone Resurrection", ${expires}, { spellId = ${SOULSTONE_BUFF}, source = "${source}" }) }`;
    expect(rows(run(onBob("now + 120")))).toEqual(["Soulstone on Bob: 2 min left"]);
    expect(rows(run(onBob("now + 900")))).toEqual([]);
    // Another Warlock's stone on Bob isn't yours.
    expect(rows(run(`${onBob("now + 900", "party2")}; units.party2 = unit("WARLOCK", 60, "Kim")`))).toEqual([
      "Soulstone ready: put it on someone",
    ]);
  });

  it("times the stone from your cast when the client gives no timer for a groupmate's buff", () => {
    const later = 'units.player.buffs = { buff("Demon Armor", now + 5000), buff("Well Fed", now + 5000) }';
    const setup = `${ready}; ${later}; group = "party"; units.party1 = unit("WARRIOR", 60, "Bob", { power = 1 })
      units.party1.buffs = { buff("Soulstone Resurrection", 0, { spellId = ${SOULSTONE_BUFF} }) }`;
    const then = `fire("UNIT_SPELLCAST_SUCCEEDED", "player", "cast", ${SOULSTONE_BUFF}); now = now + 1700; clear(); tick()`;
    expect(rows(run(setup, then))).toEqual(["Soulstone on Bob: 2 min left"]);
  });
});

describe("MGA Buffs food", () => {
  const base = `${ARMORED}; units.player.level = 15`;

  it("stays quiet while you eat, and counts the foods whose buff has another name", () => {
    expect(rows(run(`${base}; table.insert(units.player.buffs, buff("Food", now + 20))`))).toEqual([]);
    expect(rows(run(`${base}; table.insert(units.player.buffs, buff("Increased Stamina", now + 900))`))).toEqual([]);
    expect(rows(run(`${base}; table.insert(units.player.buffs, buff("Well Fed", now + 100))`))).toEqual(["Well Fed: 2 min left"]);
  });
});

describe("MGA Buffs group buffs", () => {
  const me = `${ARMORED}; ${FED}; units.player.level = 15; group = "party"`;

  it("names who to ask, only for classes in the group, and Arcane Intellect only for mana users", () => {
    const party = `${me}; units.party1 = unit("PRIEST", 60, "Bob"); units.party2 = unit("MAGE", 60, "Ann")`;
    expect(rows(run(party))).toEqual(["No Fortitude: ask Bob (Priest)", "No Arcane Intellect: ask Ann (Mage)"]);
    expect(rows(run(`${party}; units.player.power = 1`))).toEqual(["No Fortitude: ask Bob (Priest)"]);
    expect(rows(run(`${party}; table.insert(units.player.buffs, buff("Prayer of Fortitude", now + 100)); table.insert(units.player.buffs, buff("Arcane Intellect", now + 900))`))).toEqual([
      "Fortitude: 2 min left, ask Bob (Priest)",
    ]);
  });

  it("skips a caster who is dead or offline", () => {
    expect(rows(run(`${me}; units.party1 = unit("DRUID", 60, "Bob", { dead = true }); units.party2 = unit("PRIEST", 60, "Ann", { connected = false })`))).toEqual([]);
  });

  it("reads raid members", () => {
    const setup = `${me}; group = "raid"; raid = { units.player, unit("DRUID", 60, "Lee") }; units.raid1 = raid[1]; units.raid2 = raid[2]`;
    expect(rows(run(setup))).toEqual(["No Mark of the Wild: ask Lee (Druid)"]);
  });
});

describe("MGA Buffs list", () => {
  it("hides in combat and doesn't flash again after it", () => {
    const lines = run("", 'clear(); combat = true; fire("PLAYER_REGEN_DISABLED"); tick(); combat = false; tick()');
    expect(lines[0]).toBe("hidden");
    expect(lines.filter((l) => l.startsWith("flash: ") || l === "sound")).toEqual([]);
    expect(rows(lines)).toHaveLength(3);
  });

  it("redraws nothing while nothing changed", () => {
    expect(run("", "clear(); tick(); tick()")).toEqual([]);
  });

  it("hides while you're dead", () => {
    expect(run("", "clear(); units.player.dead = true; tick()")).toEqual(["hidden"]);
  });

  it("works on clients with only UnitBuff", () => {
    expect(rows(run(`C_UnitAuras = nil; ${ARMORED}; ${FED}; units.player.level = 15`))).toEqual([]);
    expect(rows(run(`C_UnitAuras = nil; ${FED}; units.player.level = 15`))).toEqual(["No Demon Skin"]);
  });

  it("uses settings saved last session, which the game loads after the addon", () => {
    expect(runAddonLua(
      [
        ["MGABuffs.lua", addonLua],
        ["then", `MGABuffsSettings = { food = false, soulstone = false }; clear(); fire("PLAYER_LOGIN")`],
      ],
      WOW_BUFF_STUBS,
    ).filter((l) => l.startsWith("row: "))).toEqual(["row: No Demon Armor"]);
  });

  it("says once, not every second, when a client API surprises it", () => {
    const lines = run("", 'clear(); UnitLevel = function() error("no level") end; tick(); tick()');
    expect(lines.filter((l) => l.startsWith("chat: MGA Buffs: stopped checking:"))).toHaveLength(1);
  });
});

describe("MGA Buffs slash command", () => {
  const slash = (msg: string): string => `SlashCmdList.MGABUFFS(${JSON.stringify(msg)})`;
  const base = `units.player.buffs = { buff("Demon Armor", now + 240) }; ${FED}; units.player.level = 15`;

  it("warns earlier with minutes, and rejects a bad number", () => {
    const lines = run(base, `clear(); ${slash("minutes 5")}`);
    expect(lines).toEqual(["chat: MGA Buffs: warning 5 min before a buff runs out.", "flash: Demon Armor: 4 min left", "sound", "row: Demon Armor: 4 min left"]);
    expect(run(base, `clear(); ${slash("minutes 99")}`)[0]).toBe("chat: MGA Buffs: give a number of minutes from 1 to 30, like /mgabuffs minutes 5.");
  });

  it("turns a check off and on", () => {
    const lines = run(`${ARMORED}; units.player.level = 15`, `clear(); ${slash("food")}`);
    expect(lines).toEqual(["chat: MGA Buffs: food reminders off.", "hidden"]);
  });

  it("lists what's on and what's missing", () => {
    const lines = run("units.player.level = 15", `clear(); ${slash("")}`);
    expect(lines.slice(0, 3)).toEqual([
      "chat: MGA Buffs: armor on, soulstone on, food on, group on; warns 3 min before a buff runs out; sound on.",
      "chat: MGA Buffs: No Demon Skin",
      "chat: MGA Buffs: Not Well Fed: eat buff food",
    ]);
    expect(run(`${ARMORED}; ${FED}; units.player.level = 15`, `clear(); ${slash("")}`)[1]).toBe("chat: MGA Buffs: nothing missing right now.");
  });

  it("shows a placeholder to drag while unlocked, and saves where it was dropped", () => {
    const lines = run(`${ARMORED}; ${FED}; units.player.level = 15`, `clear(); ${slash("unlock")}`);
    expect(lines).toEqual(["chat: MGA Buffs: drag the list where you want it, then /mgabuffs lock.", "row: MGA Buffs: drag me, then /mgabuffs lock"]);
    const saved = run("", `MGABuffsFrame.point = { "LEFT", "LEFT", 40, 12 }; MGABuffsFrame.scripts.OnDragStop(MGABuffsFrame); DEFAULT_CHAT_FRAME:AddMessage(table.concat(MGABuffsSettings.point, ","))`);
    expect(saved.slice(-1)[0]).toBe("chat: LEFT,LEFT,40,12");
  });

  it("explains itself for anything else", () => {
    expect(run("", `clear(); ${slash("help")}`)).toEqual(["chat: MGA Buffs: /mgabuffs [armor | soulstone | food | group | minutes N | sound | unlock | lock | reset]"]);
  });
});
