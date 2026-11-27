import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import coreLua from "../../addon/MGAPvPLog/Core.lua?raw";
import hubLua from "../../addon/MGAHub/MGAHub.lua?raw";
import addonLua from "../../addon/MGAPvPLog/MGAPvPLog.lua?raw";
import addonToc from "../../addon/MGAPvPLog/MGAPvPLog.toc?raw";
import trackLua from "../../addon/MGAPvPLog/Track.lua?raw";
import windowLua from "../../addon/MGAPvPLog/Window.lua?raw";
import { pvpLogAddonZip } from "@/games/wow-forever/lib/pvpLogAddon/pvpLogAddonZip";
import { HUB_ZIP_PATHS } from "@/test/addonLua/hubZipPaths";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_PVPLOG_STUBS } from "@/test/addonLua/wowPvPLogStubs.lua";

const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/\|c[0-9a-f]{8}|\|r/g, ""));

/** Loads the addon the way its .toc does, logs in, runs `scenario`; returns what the stubs recorded. */
function run(scenario: string): string[] {
  return plain(
    runAddonLua(
      [
        ["MGAHub.lua", hubLua],
        ["Core.lua", coreLua],
        ["Track.lua", trackLua],
        ["Window.lua", windowLua],
        ["MGAPvPLog.lua", addonLua],
        ["scenario", `fire("PLAYER_LOGIN"); ${scenario}`],
      ],
      WOW_PVPLOG_STUBS,
    ),
  );
}

const GORAK = `people["G1"] = { class = "Warrior", classFile = "WARRIOR", race = "Orc", name = "Gorak" }`;
const say = (expr: string): string => `table.insert(out, "v: " .. tostring(${expr}))`;
const values = (lines: string[]): string[] => lines.filter((l) => l.startsWith("v: ")).map((l) => l.slice(3));
const allChat = (lines: string[]): string[] => lines.filter((l) => l.startsWith("chat: MGA PvP Log: ")).map((l) => l.slice(19));
const chat = (lines: string[]): string[] => allChat(lines).filter((l) => !l.includes("is near you"));
const rowsOf = (lines: string[]): string[] => lines.filter((l) => l.startsWith("r: ")).map((l) => l.slice(3));
const printRows = (filter = "all"): string => `for _, r in ipairs(rows("${filter}")) do table.insert(out, "r: " .. r) end`;
const ZONE = "Stranglethorn Vale - Booty Bay";

/** The Lua with its comments removed: what the client actually runs. */
const code = (source: string): string =>
  source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

describe("MGA PvP Log files", () => {
  it("loads from its toc on the Forever interface, with a per-character log", () => {
    expect(addonToc).toContain("## Interface: 16001");
    expect(addonToc).toContain("## Dependencies: MGAHub");
    expect(addonToc).not.toContain("## SavedVariables:");
    expect(addonToc).toContain("## SavedVariablesPerCharacter: MGAPvPLogDB");
    expect(addonToc.trim().split(/\r?\n/).slice(-4)).toEqual(["Core.lua", "Track.lua", "Window.lua", "MGAPvPLog.lua"]);
  });

  it("zips the addon inside its folder, MGA Hub beside it", () => {
    const files = unzipSync(pvpLogAddonZip());
    expect(Object.keys(files).sort()).toEqual([
      "MGAPvPLog/",
      "MGAPvPLog/Core.lua",
      "MGAPvPLog/MGAPvPLog.lua",
      "MGAPvPLog/MGAPvPLog.toc",
      "MGAPvPLog/Track.lua",
      "MGAPvPLog/Window.lua",
      ...HUB_ZIP_PATHS,
    ].sort());
    expect(strFromU8(files["MGAPvPLog/Core.lua"])).toBe(coreLua);
  });
});

describe("MGA PvP Log never touches the combat log", () => {
  it("has no combat log event, function or flag in any file it ships, the MGA Hub beside it included", () => {
    for (const source of [hubLua, coreLua, trackLua, windowLua, addonLua]) {
      expect(code(source)).not.toMatch(/COMBAT_LOG|CombatLog|COMBATLOG/);
    }
  });

  it("registers only events the client lets addons have, and runs a whole fight and death without the combat log", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); recap("Gorak", "Backstab"); fire("PLAYER_DEAD"); fire("PARTY_KILL", me, "G1")
      for _, f in ipairs(hubFrames) do for e in pairs(f.events) do table.insert(out, "e: " .. e) end end`);
    const registered = lines.filter((l) => l.startsWith("e: ")).map((l) => l.slice(3)).sort();
    expect(registered).toEqual(
      expect.arrayContaining(["NAME_PLATE_UNIT_ADDED", "PARTY_KILL", "PLAYER_DEAD", "PLAYER_LOGOUT", "PLAYER_TARGET_CHANGED", "UPDATE_MOUSEOVER_UNIT"]),
    );
    expect(registered.filter((e) => e.includes("COMBAT_LOG"))).toEqual([]);
    expect(chat(lines)).toHaveLength(1);
  });
});

describe("MGA PvP Log deaths", () => {
  it("names the killer from the death recap, says so once in chat, and logs what is known about them", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak", { level = 58, guild = "Raiders" })
      clock = clock + 3; recap("Gorak", "Backstab"); fire("PLAYER_DEAD"); fire("PLAYER_DEAD")
      ${printRows()}`);
    expect(chat(lines)).toEqual([`Killed by Gorak (Orc Warrior 58) with Backstab in ${ZONE}`]);
    expect(rowsOf(lines)).toEqual([`Gorak  Orc Warrior 58  <Raiders> | ${ZONE} · just now · Killed you with Backstab · killed you ×1`]);
  });

  it("never invents a level or guild, calls melee Melee, and drops only your own realm from a name", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); recap("Gorak-Faerlina", nil, "SWING_DAMAGE"); fire("PLAYER_DEAD")
      clock = clock + 30
      fighter("nameplate2", "G2", "Vex", { realm = "Mograine" }); recap("Vex-Mograine", nil, "SWING_DAMAGE"); fire("PLAYER_DEAD")`);
    expect(chat(lines)).toEqual([`Killed by Gorak (Orc Warrior) with Melee in ${ZONE}`, `Killed by Vex-Mograine with Melee in ${ZONE}`]);
  });

  it("waits for a recap that is not there yet and names the real killer when it arrives, not a guess", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); fighter("nameplate2", "G2", "Vex")
      clock = clock + 1; fire("PLAYER_DEAD"); tick()
      ${say("#MGAPvPLogDB.log")}
      clock = clock + 1; recap("Gorak", "Cleave"); tick()`);
    expect(values(lines)).toEqual(["0"]);
    expect(chat(lines)).toEqual([`Killed by Gorak (Orc Warrior) with Cleave in ${ZONE}`]);
  });

  it("does not blame a player when the recap names something nobody saw, or hides its source", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak")
      clock = clock + 1; recap("Defias Thug", "Strike"); fire("PLAYER_DEAD")
      clock = clock + 30; fighter("nameplate1", "G1", "Gorak"); recap(nil, "Fall", "ENVIRONMENTAL_DAMAGE", { hideCaster = true }); fire("PLAYER_DEAD")
      clock = clock + 10; tick()
      ${say("#MGAPvPLogDB.log")}`);
    expect(chat(lines)).toEqual([]);
    expect(values(lines)).toEqual(["0"]);
  });

  it("falls back to the hostile player who was fighting you last, labelled probably, when no recap can be read", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); clock = clock + 1
      fighter("nameplate2", "G2", "Vex"); clock = clock + 1
      fire("PLAYER_DEAD"); ${say("#MGAPvPLogDB.log")}
      clock = clock + 3; tick()
      ${printRows()}`);
    expect(values(lines)).toEqual(["0"]);
    expect(chat(lines)).toEqual([`Probably killed by Vex in ${ZONE}`]);
    expect(rowsOf(lines)).toEqual([`Vex | ${ZONE} · just now · Probably killed you · killed you ×1`]);
  });

  it("prefers a player who was fighting you over one you only looked at later, and ignores sightings older than 10 seconds", () => {
    const fought = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); clock = clock + 2
      sight("mouseover", { guid = "G2", name = "Vex" }); clock = clock + 1
      fire("PLAYER_DEAD"); clock = clock + 3; tick()`);
    expect(chat(fought)).toEqual([`Probably killed by Gorak (Orc Warrior) in ${ZONE}`]);

    const stale = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); clock = clock + 11
      fire("PLAYER_DEAD"); clock = clock + 3; tick()
      ${say("#MGAPvPLogDB.log")}`);
    expect(chat(stale)).toEqual([]);
    expect(values(stale)).toEqual(["0"]);
  });

  it("falls back the same way when the client hides the recap's source, has no recap API, or hides the recap", () => {
    const hiddenSource = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); secretValues["Secret"] = true; recap("Secret", "Cleave"); fire("PLAYER_DEAD"); clock = clock + 3; tick()`);
    expect(chat(hiddenSource)).toEqual([`Probably killed by Gorak (Orc Warrior) in ${ZONE}`]);

    const noApi = run(`${GORAK}
      C_DeathRecap = nil; fighter("nameplate1", "G1", "Gorak"); fire("PLAYER_DEAD"); clock = clock + 3; tick()`);
    expect(chat(noApi)).toEqual([`Probably killed by Gorak (Orc Warrior) in ${ZONE}`]);

    const hiddenRecap = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); recap("Gorak", "Cleave"); secretValues[recapEvents] = true; fire("PLAYER_DEAD"); clock = clock + 3; tick()`);
    expect(chat(hiddenRecap)).toEqual([`Probably killed by Gorak (Orc Warrior) in ${ZONE}`]);
  });

  it("does not read the previous death's recap as this death's", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); recap("Gorak", "Cleave"); fire("PLAYER_DEAD")
      clock = clock + 30; fighter("nameplate1", "G1", "Gorak"); fire("PLAYER_DEAD")
      clock = clock + 3; tick()
      ${printRows("killedMe")}`);
    expect(chat(lines)).toEqual([`Killed by Gorak (Orc Warrior) with Cleave in ${ZONE}`, `Probably killed by Gorak (Orc Warrior) in ${ZONE}`]);
    expect(rowsOf(lines)).toHaveLength(2);
    expect(rowsOf(lines)[0]).toContain("killed you ×2");
  });

  it("ignores friendly players and NPCs, and anything seen while you are dead", () => {
    const lines = run(`
      playerCombat = true
      sight("nameplate1", { guid = "F1", name = "Friend", enemy = false, combat = true, targetsMe = true })
      sight("nameplate2", { guid = "M1", name = "Guard", player = false, combat = true, targetsMe = true })
      playerDead = true; sight("nameplate3", { guid = "G9", name = "Ghosty", combat = true, targetsMe = true }); playerDead = false
      fire("PLAYER_DEAD"); clock = clock + 3; tick(); MGAPvPLog.Flush(clock + 1000)
      ${printRows()} ${say("#MGAPvPLogDB.log")}`);
    expect(chat(lines)).toEqual([]);
    expect(rowsOf(lines)).toEqual([]);
    expect(values(lines)).toEqual(["0"]);
  });
});

describe("MGA PvP Log values the client hides", () => {
  it("skips a player whose name or guid is secret, and never stores or compares a secret value", () => {
    const lines = run(`
      secretValues["Hidden"] = true; secretValues["G9"] = true
      fighter("target", "G8", "Hidden"); fighter("nameplate1", "G9", "Visible")
      units.mouseover = { guid = "G7", name = "Quiet", combat = true, targetsMe = true }; units.target.dead = true
      fire("PARTY_KILL", "G9", "G8")
      fire("PLAYER_DEAD"); clock = clock + 3; tick(); MGAPvPLog.Flush(clock + 1000)
      ${say("#MGAPvPLogDB.log")}`);
    expect(chat(lines)).toEqual([]);
    expect(values(lines)).toEqual(["0"]);
  });
});

describe("MGA PvP Log kills and fights", () => {
  it("marks your kill of a hostile player you saw as I killed", () => {
    const lines = run(`${GORAK}
      fighter("target", "G1", "Gorak"); fire("PARTY_KILL", me, "G1")
      ${printRows("iKilled")} ${printRows("killedMe")}`);
    expect(rowsOf(lines)).toEqual([`Gorak  Orc Warrior | ${ZONE} · just now · You killed them · you killed ×1`]);
  });

  it("counts only your own kills of players you have seen, and takes a hidden target from the dead player you target", () => {
    const lines = run(`${GORAK}
      fighter("target", "G1", "Gorak")
      fire("PARTY_KILL", "Player-9-OTHER", "G1"); fire("PARTY_KILL", me, "Creature-1")
      ${say("#MGAPvPLogDB.log")}
      secretValues["HIDDEN"] = true; units.target.dead = true; fire("PARTY_KILL", me, "HIDDEN")
      ${say("#MGAPvPLogDB.log")}
      secretValues["HIDDEN"] = true; fire("PARTY_KILL", "HIDDEN", "G1")
      ${say("#MGAPvPLogDB.log")}`);
    expect(values(lines)).toEqual(["0", "1", "1"]);
  });

  it("calls a fight that went quiet for over a minute Fought", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak")
      clock = clock + 60; MGAPvPLog.Flush(clock); ${printRows()}
      clock = clock + 1; MGAPvPLog.Flush(clock); ${printRows()}`);
    expect(rowsOf(lines)).toEqual([`Gorak  Orc Warrior | ${ZONE} · 1 min ago · Fought`]);
  });

  it("does not log a fight for a hostile player you only look at, or one fighting somebody else", () => {
    const lines = run(`${GORAK}
      sight("target", { guid = "G1", name = "Gorak" })
      playerCombat = true; sight("nameplate1", { guid = "G2", name = "Vex", combat = true })
      MGAPvPLog.Flush(clock, true)
      ${say("#MGAPvPLogDB.log")}`);
    expect(values(lines)).toEqual(["0"]);
  });

  it("ends fights on logout", () => {
    const lines = run(`fighter("nameplate1", "G1", "Gorak"); fire("PLAYER_LOGOUT"); ${say("#MGAPvPLogDB.log")}`);
    expect(values(lines)).toEqual(["1"]);
  });

  it("lists newest first", () => {
    const lines = run(`
      fighter("target", "A", "Ann"); fire("PARTY_KILL", me, "A"); clock = clock + 400
      fighter("target", "B", "Bob"); fire("PARTY_KILL", me, "B")
      ${printRows()}`);
    expect(rowsOf(lines).map((r) => r.split(" ")[0])).toEqual(["Bob", "Ann"]);
    expect(rowsOf(lines)[1]).toContain("6 min ago");
  });
});

describe("MGA PvP Log storage", () => {
  it("keeps the last 200 encounters and forgets the enemies of the dropped ones", () => {
    const lines = run(`
      for i = 1, 205 do fighter("target", "G" .. i, "Enemy" .. i); fire("PARTY_KILL", me, "G" .. i); clock = clock + 1 end
      local n = 0; for _ in pairs(MGAPvPLogDB.enemies) do n = n + 1 end
      ${say("#MGAPvPLogDB.log")} ${say("n")} ${say("MGAPvPLogDB.enemies.G5")} ${say("MGAPvPLogDB.enemies.G6 ~= nil")} ${say("MGAPvPLogDB.log[1].guid")}`);
    expect(values(lines)).toEqual(["200", "200", "nil", "true", "G6"]);
  });

  it("saves per character as { version, settings, log, enemies }", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak", { level = 58 }); recap("Gorak", "Backstab"); fire("PLAYER_DEAD")
      local d, e, l = MGAPvPLogDB, MGAPvPLogDB.enemies.G1, MGAPvPLogDB.log[1]
      ${say("d.version .. ' ' .. tostring(d.settings.chat) .. ' ' .. #d.log")}
      ${say("e.name .. ' ' .. e.race .. ' ' .. e.class .. ' ' .. e.classFile .. ' ' .. e.level .. ' ' .. e.killedYou .. ' ' .. e.youKilled .. ' ' .. e.fights")}
      ${say("l.guid .. ' ' .. l.outcome .. ' ' .. l.spell .. ' ' .. l.zone .. ' ' .. l.time .. ' ' .. tostring(l.probable)")}`);
    expect(values(lines)).toEqual(["1 true 1", "Gorak Orc Warrior WARRIOR 58 1 0 1", `G1 killedMe Backstab ${ZONE} 1000 nil`]);
  });

  it("marks a guessed killer as probable in the saved log", () => {
    const lines = run(`fighter("nameplate1", "G1", "Gorak"); fire("PLAYER_DEAD"); clock = clock + 3; tick()
      ${say("MGAPvPLogDB.log[1].probable")}`);
    expect(values(lines)).toEqual(["true"]);
  });

  it("keeps the log through a reload and drops it on Clear", () => {
    const lines = run(`
      fighter("target", "G1", "Gorak"); fire("PARTY_KILL", me, "G1")
      MGAPvPLog.Clear()
      ${say("#MGAPvPLogDB.log .. ' ' .. tostring(next(MGAPvPLogDB.enemies))")}`);
    expect(values(lines)).toEqual(["0 nil"]);
  });
});

describe("MGA PvP Log window and settings", () => {
  it("opens from the MGA menu and /mgapvp, filters, and asks twice before clearing", () => {
    const lines = run(`${GORAK}
      fighter("target", "G1", "Gorak"); fire("PARTY_KILL", me, "G1"); clock = clock + 5
      fighter("nameplate2", "G3", "Vex"); recap("Vex", "Frostbolt"); fire("PLAYER_DEAD")
      MGAHub.OpenMenu(); ${say("table.concat(menuLines(), ' | ')")} clickRow("PvP log")
      ${say("tostring(MGAPvPLogWindow.shownFlag) .. ' ' .. MGAPvPLogRow1Head.text .. ' / ' .. MGAPvPLogRow2Head.text")}
      click(MGAPvPLogFilter3); ${say("MGAPvPLogFilter3.text .. ' ' .. MGAPvPLogRow1Head.text .. ' ' .. tostring(MGAPvPLogRow2.shownFlag)")}
      click(MGAPvPLogClear); ${say("MGAPvPLogClear.text .. ' ' .. #MGAPvPLogDB.log")}
      MGAPvPLogWindow:Hide(); ${say("MGAPvPLogClear.text .. ' ' .. #MGAPvPLogDB.log")}
      SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogClear); click(MGAPvPLogClear)
      ${say("#MGAPvPLogDB.log .. ' ' .. tostring(MGAPvPLogEmpty.shownFlag)")}
      SlashCmdList.MGAPVPLOG(""); ${say("MGAPvPLogWindow.shownFlag")}`);
    const v = values(lines);
    expect(v[0]).toBe("[PvP Log] | PvP log | - | Settings");
    expect(v[1]).toMatch(/^true Vex \/ Gorak /);
    expect(v[2]).toMatch(/^I killed Gorak /);
    expect(v[2]).toMatch(/ false$/);
    expect(v[3]).toBe("Click again to clear 2");
    expect(v[4]).toBe("Clear log 2");
    expect(v[5]).toBe("0 true");
    expect(v[6]).toBe("false");
  });

  it("turns the death chat line off and on from the settings checkbox and /mgapvp chat, still logging the death", () => {
    const lines = run(`${GORAK}
      click(MGAPvPLogOptions_chat); ${say("MGAPvPLogDB.settings.chat")}
      fighter("nameplate1", "G1", "Gorak"); recap("Gorak", "Backstab"); fire("PLAYER_DEAD"); ${say("#MGAPvPLogDB.log")}
      SlashCmdList.MGAPVPLOG("chat"); ${say("tostring(MGAPvPLogDB.settings.chat) .. ' ' .. tostring(MGAPvPLogOptions_chat.checked)")}
      clock = clock + 30; fighter("nameplate1", "G1", "Gorak"); recap("Gorak", "Backstab"); fire("PLAYER_DEAD")`);
    expect(values(lines)).toEqual(["false", "1", "true true"]);
    expect(chat(lines)).toEqual(["death chat line on.", `Killed by Gorak (Orc Warrior) with Backstab in ${ZONE}`]);
  });
});

const near = (lines: string[]): string[] => allChat(lines).filter((l) => l.includes("is near you"));
const TRACK_GORAK = `${GORAK}; MGAPvPLog.SetTracked("Gorak", true)`;
const LOOK = `sight("mouseover", { guid = "G1", name = "Gorak" })`;

describe("MGA PvP Log tracking", () => {
  it("adds whoever kills you to the list, with where you were, unless that setting is off", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); ${say("MGAPvPLog.IsTracked('Gorak')")}
      recap("Gorak", "Cleave"); fire("PLAYER_DEAD"); ${say("MGAPvPLog.IsTracked('Gorak')")}
      local seen = MGAPvPLogDB.tracked.gorak.seen
      ${say("seen.zone .. '|' .. seen.subzone .. '|' .. seen.map .. '|' .. string.format('%.0f,%.0f', seen.x, seen.y)")}
      MGAPvPLogDB.settings.autoTrack = false; clock = clock + 30
      fighter("nameplate2", "G3", "Vex"); recap("Vex", "Frostbolt"); fire("PLAYER_DEAD")
      ${say("MGAPvPLog.IsTracked('Vex')")}`);
    expect(values(lines)).toEqual(["false", "true", "Stranglethorn Vale|Booty Bay|1434|41,62", "false"]);
  });

  it("warns when a tracked player turns up on screen, by target or mouseover", () => {
    const lines = run(`${GORAK}
      MGAPvPLog.SetTracked("Gorak", true); MGAPvPLog.SetTracked("Vex", true)
      sight("target", { guid = "G1", name = "Gorak" })
      clock = clock + 100
      sight("mouseover", { guid = "G3", name = "Vex" })`);
    expect(near(lines)).toEqual([`Gorak is near you: ${ZONE} (41, 62)`, `Vex is near you: ${ZONE} (41, 62)`]);
  });

  it("describes the player in the warning: race, class, and how often they killed you", () => {
    const lines = run(`${GORAK}
      fighter("nameplate1", "G1", "Gorak"); recap("Gorak", "Cleave"); fire("PLAYER_DEAD"); clock = clock + 30
      ${LOOK}`);
    expect(near(lines)).toEqual([`Gorak (Orc Warrior, killed you ×1) is near you: ${ZONE} (41, 62)`]);
  });

  it("notices a tracked player on a nameplate, as your target, on mouseover and as a group member's target", () => {
    const sources: Array<[string, string]> = [
      [`sight("nameplate3", { guid = "G1", name = "Gorak" })`, "nameplate"],
      [`sight("target", { guid = "G1", name = "Gorak" })`, "target"],
      [`sight("mouseover", { guid = "G1", name = "Gorak" })`, "mouseover"],
      [`groupSize = 3; units["party2target"] = { guid = "G1", name = "Gorak" }; MGAPvPLogEvents.scripts.OnUpdate(MGAPvPLogEvents, 6)`, "party"],
      [`groupSize = 3; inRaid = true; units["raid3target"] = { guid = "G1", name = "Gorak" }; MGAPvPLogEvents.scripts.OnUpdate(MGAPvPLogEvents, 6)`, "raid"],
    ];
    for (const [scenario, label] of sources) {
      expect(near(run(`${TRACK_GORAK}; ${scenario}`)), label).toHaveLength(1);
    }
  });

  it("keys tracked players on their name and realm, so a same-named player elsewhere is not them", () => {
    const lines = run(`MGAPvPLog.SetTracked("Gorak-Elsewhere", true)
      ${say("MGAPvPLog.IsTracked('Gorak-Elsewhere')")} ${say("MGAPvPLog.IsTracked('Gorak')")}`);
    expect(values(lines)).toEqual(["true", "false"]);
  });

  it("ignores untracked players, non-player units, hidden names and players you stop tracking", () => {
    const lines = run(`${GORAK}
      ${LOOK}
      MGAPvPLog.SetTracked("Gorak", true); sight("target", { guid = "G1", name = "Gorak", player = false })
      secretValues["Gorak"] = true; ${LOOK}; secretValues["Gorak"] = nil
      MGAPvPLog.SetTracked("Gorak", false); ${LOOK}`);
    expect(near(lines)).toEqual([]);
  });

  it("warns once a minute, again when they leave and come back, and updates where you saw them every time", () => {
    const lines = run(`${TRACK_GORAK}
      for i = 1, 13 do ${LOOK}; clock = clock + 5 end
      clock = clock + 25; subzone = "Nesingwary's Expedition"; mapX = 0.5; ${LOOK}
      local seen = MGAPvPLogDB.tracked.gorak.seen
      ${say("seen.subzone .. ' ' .. string.format('%.0f', seen.x) .. ' ' .. seen.time")}`);
    expect(near(lines)).toHaveLength(3);
    expect(values(lines)).toEqual(["Nesingwary's Expedition 50 1090"]);
  });

  it("plays a sound and shows a banner with each warning, unless that setting is off; the chat line stays", () => {
    const lines = run(`${TRACK_GORAK}
      ${LOOK}; ${say("sounds .. ' ' .. tostring(MGAPvPLogBanner.shownFlag) .. ' ' .. MGAPvPLogBannerText.text")}
      MGAPvPLogBanner.scripts.OnUpdate(MGAPvPLogBanner, 5); ${say("MGAPvPLogBanner.shownFlag")}
      MGAHub.OpenSettings(); click(MGAPvPLogOptions_alertFx); clock = clock + 100; ${LOOK}
      ${say("sounds .. ' ' .. tostring(MGAPvPLogBanner.shownFlag)")}`);
    expect(values(lines)).toEqual(["1 true Gorak is near you", "false", "1 false"]);
    expect(near(lines)).toHaveLength(2);
  });

  it("says no position when the client gives none, and the Tracked tab says so", () => {
    const lines = run(`${TRACK_GORAK}; mapId = nil
      ${LOOK}; SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogFilter4)
      ${say("MGAPvPLogRow1Detail.text")}`);
    expect(near(lines)).toEqual([`Gorak is near you: ${ZONE}`]);
    expect(values(lines)).toEqual([`You were in ${ZONE} · just now`]);
  });

  it("lists tracked players on their own tab and tracks or untracks from any row, and by /mgapvp track", () => {
    const lines = run(`${GORAK}
      SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogFilter4)
      ${say("MGAPvPLogEmpty.text .. ' ' .. tostring(MGAPvPLogEmpty.shownFlag)")}
      fighter("target", "G1", "Gorak"); fire("PARTY_KILL", me, "G1"); click(MGAPvPLogFilter1)
      ${say("MGAPvPLogRow1Track.text")} click(MGAPvPLogRow1Track)
      ${say("MGAPvPLogRow1Track.text .. ' ' .. tostring(MGAPvPLog.IsTracked('Gorak'))")}
      click(MGAPvPLogFilter4); ${say("MGAPvPLogRow1Head.text .. ' | ' .. MGAPvPLogRow1Detail.text")}
      click(MGAPvPLogRow1Track); ${say("tostring(MGAPvPLogRow1.shownFlag) .. ' ' .. tostring(MGAPvPLog.IsTracked('Gorak'))")}
      SlashCmdList.MGAPVPLOG("track Vex"); ${say("tostring(MGAPvPLog.IsTracked('Vex')) .. ' ' .. MGAPvPLogRow1Head.text")}
      SlashCmdList.MGAPVPLOG("untrack Vex"); ${say("MGAPvPLog.IsTracked('Vex')")}`);
    expect(values(lines)).toEqual([
      "Nobody tracked yet. Press Track on a row, or type /mgapvp track <name>. true",
      "Track",
      "Untrack true",
      "Gorak  Orc Warrior | Not seen yet",
      "false false",
      "true Vex",
      "false",
    ]);
  });

  it("offers Go to last seen only when MGA Waypoints is installed and you had a map position", () => {
    const seen = `${LOOK}; SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogFilter4)`;
    const waypoints = `MGAWaypoints = { SetTarget = function(p) table.insert(out, string.format("wp: %s|%s|%d|%.0f|%.0f|%s", p.name, p.kind, p.map, p.x, p.y, p.zone)) end }`;
    const without = run(`${TRACK_GORAK}; ${seen}; ${say("MGAPvPLogRow1Go.shownFlag")}`);
    expect(values(without)).toEqual(["false"]);

    const noPosition = run(`${waypoints}; ${TRACK_GORAK}; mapId = nil; ${seen}; ${say("MGAPvPLogRow1Go.shownFlag")}`);
    expect(values(noPosition)).toEqual(["false"]);

    const withIt = run(`${waypoints}; ${TRACK_GORAK}; ${seen}; ${say("tostring(MGAPvPLogRow1Go.shownFlag) .. ' ' .. MGAPvPLogRow1Go.text")} click(MGAPvPLogRow1Go)`);
    expect(values(withIt)).toEqual(["true Go to last seen"]);
    expect(withIt.filter((l) => l.startsWith("wp: "))).toEqual(["wp: Where you saw Gorak|pvp|1434|41|62|Stranglethorn Vale"]);
  });

  it("adds the tracking switches to the settings page, on by default", () => {
    const lines = run(`MGAHub.OpenSettings()
      ${say("tostring(MGAPvPLogOptions_autoTrack.checked) .. ' ' .. tostring(MGAPvPLogOptions_alertFx.checked)")}
      click(MGAPvPLogOptions_autoTrack); ${say("MGAPvPLogDB.settings.autoTrack")}`);
    expect(values(lines)).toEqual(["true true", "false"]);
  });
});
