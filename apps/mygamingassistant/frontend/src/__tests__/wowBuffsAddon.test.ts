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
  it("lists what a Warlock is missing at login without a flash, then flashes a new reminder once with a sound", () => {
    const lines = run("");
    expect(rows(lines)).toEqual(["No Demon Armor", "No Soulstone in your bags: Create Soulstone", "Not Well Fed: eat buff food"]);
    expect(lines.filter((l) => l.startsWith("flash: ") || l === "sound")).toEqual([]);
    const later = run(`${ARMORED}; ${FED}; ${STONE_IN_BAGS}; cooldowns[${MAJOR_SOULSTONE}] = { start = now, duration = 1800 }`, "clear(); units.player.buffs = {}; tick(); tick()");
    expect(later).toEqual(["row: No Demon Armor", "row: Not Well Fed: eat buff food", "flash: No Demon Armor", "sound", "flash: Not Well Fed: eat buff food", "sound"]);
  });

  it("stays silent with the sound off", () => {
    expect(run(FED, `clear(); SlashCmdList.MGABUFFS("sound"); clear(); units.player.buffs = {}; tick()`).filter((l) => l.startsWith("flash: ") || l === "sound")).toEqual([]);
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
    expect(rows(run(`${ready}; group = "party"; units.party1 = unit("WARRIOR", 60, "Bob")`))).toEqual([
      "Soulstone ready: put it on someone",
    ]);
  });

  it("doesn't ask for a stone before you've trained Create Soulstone", () => {
    expect(rows(run(`${ARMORED}; ${FED}; for _, id in ipairs({ 693, 20752, 20755, 20756, 20757 }) do knownSpells[id] = false end`))).toEqual([]);
  });

  it("stays quiet while the stone is on cooldown", () => {
    expect(rows(run(`${ready}; cooldowns[${MAJOR_SOULSTONE}] = { start = now - 60, duration = 1800 }`))).toEqual([]);
  });

  it("warns when your Soulstone on a groupmate is about to run out", () => {
    const party = `${ready}; group = "party"; units.party1 = unit("WARRIOR", 60, "Bob")`;
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
    const setup = `${ready}; ${later}; group = "party"; units.party1 = unit("WARRIOR", 60, "Bob")
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
    expect(rows(run(`${party}; units.player = unit("WARRIOR", 60, "Me", { buffs = { buff("Well Fed", now + 600) } })`))).toEqual(["No Fortitude: ask Bob (Priest)"]);
    expect(rows(run(`${party}; table.insert(units.player.buffs, buff("Prayer of Fortitude", now + 100)); table.insert(units.player.buffs, buff("Arcane Intellect", now + 900))`))).toEqual([
      "Fortitude: 2 min left, ask Bob (Priest)",
    ]);
  });

  it("keeps Arcane Intellect for a Druid in Bear or Cat form, and says to cast what you can cast", () => {
    const setup = `units.player = unit("DRUID", 60, "Me", { buffs = { buff("Well Fed", now + 600), buff("Mark of the Wild", now + 900) } }); group = "party"; units.party1 = unit("MAGE", 60, "Ann")`;
    expect(rows(run(setup))).toEqual(["No Arcane Intellect: ask Ann (Mage)", "Mark of the Wild missing on Ann"]);
    expect(rows(run(`${me}; units.player = unit("PRIEST", 60, "Me", { buffs = { buff("Inner Fire", now + 500), buff("Well Fed", now + 600) } })`))).toEqual(["No Fortitude: cast it"]);
  });

  it("asks someone whose name hasn't loaded yet", () => {
    expect(rows(run(`${me}; units.party1 = unit("PRIEST", 60, nil)`))).toEqual([
      "No Fortitude: ask someone (Priest)",
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

describe("MGA Buffs Healthstone", () => {
  const NO_STONE = "bags[4] = nil";
  const warlock = `${ARMORED}; ${FED}; units.player.level = 15; ${NO_STONE}`;
  const rogue = `units.player = unit("ROGUE", 30, "Me", { buffs = { buff("Well Fed", now + 600) } }); ${NO_STONE}`;

  it("tells a Warlock with no Healthstone to make one, once Create Healthstone is trained", () => {
    expect(rows(run(warlock))).toEqual(["No Healthstone in your bags: Create Healthstone"]);
    const untrained = [6201, 6202, 5699, 11729, 11730, 11731, 20018, 23517, 23518, 23519, 23520, 23521, 23522, 23813, 23814, 23815, 23816, 23817, 23818, 23819, 23820, 23821, 28023]
      .map((id) => `knownSpells[${id}] = false`).join("; ");
    expect(rows(run(`${warlock}; ${untrained}`))).toEqual([]);
  });

  it("counts every rank, the Improved Healthstone ones too", () => {
    expect(rows(run(`${warlock}; bags[1] = { 19013 }`))).toEqual([]);
    expect(rows(run(`${warlock}; bags[2] = { 5512 }`))).toEqual([]);
  });

  it("asks the Warlock in your group, and stays quiet solo or with a Warlock under 10", () => {
    expect(rows(run(rogue))).toEqual([]);
    expect(rows(run(`${rogue}; group = "party"; units.party1 = unit("WARLOCK", 40, "Kim")`))).toEqual(["No Healthstone: ask Kim (Warlock)"]);
    expect(rows(run(`${rogue}; group = "party"; units.party1 = unit("WARLOCK", 9, "Kim")`))).toEqual([]);
    expect(rows(run(`${rogue}; group = "party"; units.party1 = unit("WARLOCK", 40, "Kim", { dead = true })`))).toEqual([]);
  });

  it("turns off from the slash command", () => {
    expect(rows(run(warlock, `clear(); SlashCmdList.MGABUFFS("healthstone"); clear(); tick()`))).toEqual([]);
  });
});

describe("MGA Buffs Paladin Blessings", () => {
  const rogue = `units.player = unit("ROGUE", 30, "Me", { buffs = { buff("Well Fed", now + 600) } }); group = "party"; units.party1 = unit("PALADIN", 40, "Pat")`;

  it("asks the Paladin in your group for a Blessing, any one of them", () => {
    expect(rows(run(rogue))).toEqual(["No Blessing: ask Pat (Paladin)"]);
    expect(rows(run(`${rogue}; table.insert(units.player.buffs, buff("Blessing of Kings", now + 60))`))).toEqual([]);
    expect(rows(run(`${rogue}; table.insert(units.player.buffs, buff("Greater Blessing of Might", now + 800))`))).toEqual([]);
  });

  it("doesn't call a 5-minute Blessing \"running out\"", () => {
    expect(rows(run(`${rogue}; table.insert(units.player.buffs, buff("Blessing of Might", now + 120))`))).toEqual([]);
  });
});

describe("MGA Buffs party: buffs you can cast", () => {
  const priest = `units.player = unit("PRIEST", 60, "Me", { buffs = { buff("Inner Fire", now + 900), buff("Well Fed", now + 600), buff("Power Word: Fortitude", now + 900), buff("Divine Spirit", now + 900), buff("Arcane Intellect", now + 900) } }); group = "party"`;
  const DIVINE_SPIRIT_OFF = [14752, 14818, 14819, 16875, 27841, 27681].map((id) => `knownSpells[${id}] = false`).join("; ");

  it("names who in your party is missing your buffs, and skips Divine Spirit on a Warrior", () => {
    const party = `${priest}; units.party1 = unit("WARRIOR", 60, "Bob"); units.party2 = unit("MAGE", 60, "Ann")`;
    expect(rows(run(party))).toEqual(["Fortitude missing on Bob, Ann", "Divine Spirit missing on Ann"]);
  });

  it("counts a group version and a groupmate's own buff as covered", () => {
    const party = `${priest}; ${DIVINE_SPIRIT_OFF}; units.party1 = unit("WARRIOR", 60, "Bob", { buffs = { buff("Prayer of Fortitude", now + 900) } })`;
    expect(rows(run(party))).toEqual([]);
  });

  it("leaves Divine Spirit out when you don't have the talent, and never asks others for it", () => {
    expect(rows(run(`${priest}; ${DIVINE_SPIRIT_OFF}; units.party1 = unit("MAGE", 60, "Ann", { buffs = { buff("Power Word: Fortitude", now + 900) } })`))).toEqual([]);
    const mage = `units.player = unit("MAGE", 60, "Me", { buffs = { buff("Ice Armor", now + 900), buff("Arcane Intellect", now + 900), buff("Well Fed", now + 600), buff("Power Word: Fortitude", now + 900) } }); group = "party"; units.party1 = unit("PRIEST", 60, "Pri", { buffs = { buff("Arcane Intellect", now + 900) } })`;
    expect(rows(run(mage))).toEqual([]);
  });

  it("counts groupmates out of range instead of naming them, and skips dead or offline ones", () => {
    const party = `${priest}; ${DIVINE_SPIRIT_OFF}; units.party1 = unit("WARRIOR", 60, "Bob"); units.party2 = unit("ROGUE", 60, "Ann"); inRange.party2 = false; units.party3 = unit("HUNTER", 60, "Dee", { dead = true }); units.party4 = unit("WARLOCK", 60, "Kim", { connected = false })`;
    expect(rows(run(party))).toEqual(["Fortitude missing on Bob (+1 out of range)"]);
    expect(rows(run(`${party}; inRange.party1 = false`))).toEqual(["Fortitude missing on 2 out of range"]);
  });

  it("shortens a long raid list", () => {
    const names = ["Ann", "Bob", "Cat", "Dee", "Eve"];
    const raid = names.map((n, i) => `units.raid${i + 2} = unit("WARRIOR", 60, "${n}")`).join("; ");
    expect(rows(run(`${priest}; ${DIVINE_SPIRIT_OFF}; group = "raid"; units.raid1 = units.player; ${raid}`))).toEqual(["Fortitude missing on Ann, Bob, Cat and 2 more"]);
  });

  it("stays quiet solo, and turns off from the slash command", () => {
    expect(rows(run(priest))).toEqual([]);
    const party = `${priest}; units.party1 = unit("WARRIOR", 60, "Bob")`;
    expect(rows(run(party, `clear(); SlashCmdList.MGABUFFS("party"); clear(); tick()`))).toEqual([]);
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

  it("still draws the list when the mid-screen flash breaks, and says so once", () => {
    const lines = run(FED, 'clear(); RaidNotice_AddMessage = function() error("no frame") end; units.player.buffs = {}; tick(); tick()');
    expect(rows(lines)).toEqual(["No Demon Armor", "No Soulstone in your bags: Create Soulstone", "Not Well Fed: eat buff food"]);
    expect(lines.filter((l) => l.startsWith("chat: MGA Buffs: can't flash reminders mid-screen:"))).toHaveLength(1);
    expect(lines).not.toContain("hidden");
  });

  it("says once, not every second, when a client API surprises it", () => {
    const lines = run("", 'clear(); UnitLevel = function() error("no level") end; tick(); tick()');
    expect(lines.filter((l) => l.startsWith("chat: MGA Buffs: stopped checking:"))).toHaveLength(1);
  });
});

describe("MGA Buffs options window", () => {
  const quiet = `${ARMORED}; ${FED}; units.player.level = 15`;
  const box = (key: string): string => `MGABuffsOptions_${key}`;

  it("adds itself to Options > AddOns and shows the saved settings", () => {
    const lines = runAddonLua(
      [
        ["MGABuffs.lua", addonLua],
        ["then", `MGABuffsSettings = { food = false, minutes = 5, locked = false }; fire("PLAYER_LOGIN")
          for _, k in ipairs({ "armor", "soulstone", "healthstone", "food", "group", "party", "sound", "unlock" }) do
            DEFAULT_CHAT_FRAME:AddMessage(k .. "=" .. tostring(_G["MGABuffsOptions_" .. k]:GetChecked()))
          end
          DEFAULT_CHAT_FRAME:AddMessage(MGABuffsOptions_minutesText.text)`],
      ],
      WOW_BUFF_STUBS,
    );
    expect(lines).toContain("options: added MGA Buffs");
    expect(lines.filter((l) => l.startsWith("chat: "))).toEqual([
      "chat: armor=true",
      "chat: soulstone=true",
      "chat: healthstone=true",
      "chat: food=false",
      "chat: group=true",
      "chat: party=true",
      "chat: sound=true",
      "chat: unlock=true",
      "chat: 5 minutes",
    ]);
  });

  it("turns a reminder off and on with its checkbox", () => {
    expect(run(`units.player.buffs = { buff("Demon Armor", now + 1200) }; units.player.level = 15`, `clear(); click(${box("food")})`)).toEqual(["hidden"]);
    const back = run(`units.player.buffs = { buff("Demon Armor", now + 1200) }; units.player.level = 15`, `click(${box("food")}); clear(); click(${box("food")})`);
    expect(rows(back)).toEqual(["Not Well Fed: eat buff food"]);
  });

  it("warns earlier or later with the - and + buttons, between 1 and 30 minutes", () => {
    const base = `units.player.buffs = { buff("Demon Armor", now + 240) }; ${FED}; units.player.level = 15`;
    const lines = run(base, `clear(); click(MGABuffsOptions_plus); click(MGABuffsOptions_plus); DEFAULT_CHAT_FRAME:AddMessage(MGABuffsOptions_minutesText.text)`);
    expect(lines.filter((l) => l.startsWith("flash: ") || l === "sound")).toEqual(["flash: Demon Armor: 4 min left", "sound"]);
    expect(rows(lines)).toContain("Demon Armor: 4 min left");
    expect(lines.slice(-1)[0]).toBe("chat: 5 minutes");
    const floor = run(quiet, `for _ = 1, 5 do click(MGABuffsOptions_minus) end; DEFAULT_CHAT_FRAME:AddMessage(MGABuffsOptions_minutesText.text .. " " .. MGABuffsSettings.minutes)`);
    expect(floor.slice(-1)[0]).toBe("chat: 1 minute 1");
    const ceiling = run(quiet, `MGABuffsSettings.minutes = 29; click(MGABuffsOptions_plus); click(MGABuffsOptions_plus); DEFAULT_CHAT_FRAME:AddMessage(MGABuffsSettings.minutes)`);
    expect(ceiling.slice(-1)[0]).toBe("chat: 30");
  });

  it("turns the flash and sound off", () => {
    const lines = run(FED, `click(${box("sound")}); clear(); units.player.buffs = {}; tick()`);
    expect(lines.filter((l) => l.startsWith("flash: ") || l === "sound")).toEqual([]);
    expect(rows(lines)).toContain("No Demon Armor");
  });

  it("unlocks the list to drag it, locks it again, and puts it back with Reset", () => {
    expect(rows(run(quiet, `clear(); click(${box("unlock")})`))).toEqual(["MGA Buffs: drag me, then lock it in Options > AddOns > MGA Buffs"]);
    expect(run(quiet, `click(${box("unlock")}); clear(); click(${box("unlock")})`)).toEqual(["hidden"]);
    const reset = run(quiet, `MGABuffsSettings.point = { "LEFT", "LEFT", 40, 12 }; click(MGABuffsOptions_reset); DEFAULT_CHAT_FRAME:AddMessage(tostring(MGABuffsSettings.point) .. " " .. table.concat(MGABuffsFrame.point, ","))`);
    expect(reset.slice(-1)[0]).toBe("chat: nil TOP,TOP,0,-140");
  });

  it("shows what's missing in chat with its button", () => {
    const lines = run("units.player.level = 15", `clear(); click(MGABuffsOptions_status)`);
    expect(lines.slice(0, 3)).toEqual([
      "chat: MGA Buffs: armor on, soulstone on, healthstone on, food on, group on, party on; warns 3 min before a buff runs out; sound on.",
      "chat: MGA Buffs: No Demon Skin",
      "chat: MGA Buffs: Not Well Fed: eat buff food",
    ]);
  });

  it("keeps reminding when the options page can't be built", () => {
    const lines = run(`Settings = { RegisterCanvasLayoutCategory = function() error("no canvas") end, RegisterAddOnCategory = function() end }; ${FED}`);
    expect(lines.some((l) => l.startsWith("chat: MGA Buffs: options page unavailable:"))).toBe(true);
    expect(rows(lines)).toContain("No Demon Armor");
  });

  it("explains in chat when the options page won't open", () => {
    const lines = run(`Settings.OpenToCategory = function() error("no page") end; ${quiet}`, `clear(); SlashCmdList.MGABUFFS("")`);
    expect(lines).toEqual(["chat: MGA Buffs: this game version has no AddOns options page; /mgabuffs help lists the commands."]);
  });

  it("uses the older Interface Options list on clients without the Settings window", () => {
    const lines = run("Settings = nil", `SlashCmdList.MGABUFFS("")`);
    expect(lines).toContain("options: added (old list) MGA Buffs");
    expect(lines.slice(-1)[0]).toBe("options: opened (old list) MGA Buffs");
  });
});

describe("MGA Buffs slash command", () => {
  const slash = (msg: string): string => `SlashCmdList.MGABUFFS(${JSON.stringify(msg)})`;
  const base = `units.player.buffs = { buff("Demon Armor", now + 240) }; ${FED}; units.player.level = 15`;
  const quiet = `${ARMORED}; ${FED}; units.player.level = 15`;

  it("opens the options window with no arguments", () => {
    expect(run(quiet, `clear(); ${slash("")}`)).toEqual(["options: opened id:MGA Buffs"]);
  });

  it("keeps the options window in step with a shortcut", () => {
    const lines = run(quiet, `clear(); ${slash("food")}; ${slash("minutes 7")}; DEFAULT_CHAT_FRAME:AddMessage(tostring(MGABuffsOptions_food:GetChecked()) .. " " .. MGABuffsOptions_minutesText.text)`);
    expect(lines.slice(-1)[0]).toBe("chat: false 7 minutes");
  });

  it("warns earlier with minutes, and rejects a bad number", () => {
    const lines = run(base, `clear(); ${slash("minutes 5")}`);
    expect(lines).toEqual(["row: Demon Armor: 4 min left", "flash: Demon Armor: 4 min left", "sound", "chat: MGA Buffs: warning 5 min before a buff runs out."]);
    expect(run(base, `clear(); ${slash("minutes 99")}`)[0]).toBe("chat: MGA Buffs: give a number of minutes from 1 to 30, like /mgabuffs minutes 5.");
  });

  it("turns a check off and on", () => {
    expect(run(`${ARMORED}; units.player.level = 15`, `clear(); ${slash("food")}`)).toEqual(["hidden", "chat: MGA Buffs: food reminders off."]);
  });

  it("lists what's on and what's missing", () => {
    expect(run(quiet, `clear(); ${slash("status")}`)[1]).toBe("chat: MGA Buffs: nothing missing right now.");
  });

  it("saves where the list was dropped", () => {
    const saved = run("", `MGABuffsFrame.point = { "LEFT", "LEFT", 40, 12 }; MGABuffsFrame.scripts.OnDragStop(MGABuffsFrame); DEFAULT_CHAT_FRAME:AddMessage(table.concat(MGABuffsSettings.point, ","))`);
    expect(saved.slice(-1)[0]).toBe("chat: LEFT,LEFT,40,12");
  });

  it("explains itself for anything else", () => {
    expect(run("", `clear(); ${slash("help")}`)).toEqual([
      "chat: MGA Buffs: /mgabuffs opens the options. Shortcuts: status | armor | soulstone | healthstone | food | group | party | minutes N | sound | unlock | lock | reset",
    ]);
  });
});
