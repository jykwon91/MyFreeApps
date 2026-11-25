import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import coreLua from "../../addon/MGAPvPLog/Core.lua?raw";
import hubLua from "../../addon/MGAPvPLog/MGAHub.lua?raw";
import addonLua from "../../addon/MGAPvPLog/MGAPvPLog.lua?raw";
import addonToc from "../../addon/MGAPvPLog/MGAPvPLog.toc?raw";
import trackLua from "../../addon/MGAPvPLog/Track.lua?raw";
import windowLua from "../../addon/MGAPvPLog/Window.lua?raw";
import { pvpLogAddonZip } from "@/games/wow-forever/lib/pvpLogAddon/pvpLogAddonZip";
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
const chat = (lines: string[]): string[] => lines.filter((l) => l.startsWith("chat: MGA PvP Log: ")).map((l) => l.slice(19));
const rowsOf = (lines: string[]): string[] => lines.filter((l) => l.startsWith("r: ")).map((l) => l.slice(3));
const printRows = (filter = "all"): string => `for _, r in ipairs(rows("${filter}")) do table.insert(out, "r: " .. r) end`;

describe("MGA PvP Log files", () => {
  it("loads from its toc on the Forever interface, with a per-character log", () => {
    expect(addonToc).toContain("## Interface: 16001");
    expect(addonToc).toContain("## SavedVariables: MGAHubSettings");
    expect(addonToc).toContain("## SavedVariablesPerCharacter: MGAPvPLogDB");
    expect(addonToc.trim().split(/\r?\n/).slice(-5)).toEqual(["MGAHub.lua", "Core.lua", "Track.lua", "Window.lua", "MGAPvPLog.lua"]);
  });

  it("zips the addon inside its folder", () => {
    const files = unzipSync(pvpLogAddonZip());
    expect(Object.keys(files).sort()).toEqual([
      "MGAPvPLog/",
      "MGAPvPLog/Bindings.xml",
      "MGAPvPLog/Core.lua",
      "MGAPvPLog/MGAHub.lua",
      "MGAPvPLog/MGAPvPLog.lua",
      "MGAPvPLog/MGAPvPLog.toc",
      "MGAPvPLog/Track.lua",
      "MGAPvPLog/Window.lua",
    ]);
    expect(strFromU8(files["MGAPvPLog/Core.lua"])).toBe(coreLua);
  });
});

describe("MGA PvP Log deaths", () => {
  it("blames the hostile player who hit you last and says so once in chat, with what is known about them", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Backstab", 300)
      units.target = { guid = "G1", level = 58, guild = "Raiders" }; fire("PLAYER_TARGET_CHANGED")
      clock = clock + 3; fire("PLAYER_DEAD"); fire("PLAYER_DEAD")
      ${printRows()}`);
    expect(chat(lines)).toEqual(["Killed by Gorak (Orc Warrior 58) with Backstab in Stranglethorn Vale - Booty Bay"]);
    expect(rowsOf(lines)).toEqual(["Gorak  Orc Warrior 58  <Raiders> | Stranglethorn Vale - Booty Bay · just now · Killed you with Backstab · you took 300, dealt 0 · killed you ×1"]);
  });

  it("never invents a level or guild, calls melee Melee and drops the realm of your own realm only", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak-Faerlina", HOSTILE_PLAYER); clock = clock + 1; fire("PLAYER_DEAD")
      enemyHits("G2", "Vex-Mograine", HOSTILE_PLAYER); clock = clock + 1; fire("PLAYER_DEAD")`);
    expect(chat(lines)).toEqual([
      "Killed by Gorak (Orc Warrior) with Melee in Stranglethorn Vale - Booty Bay",
      "Killed by Vex-Mograine with Melee in Stranglethorn Vale - Booty Bay",
    ]);
  });

  it("blames the most recent hitter among several, and nobody for a hit more than 10 seconds old", () => {
    const lines = run(`${GORAK}
      enemyHits("G2", "Vex", HOSTILE_PLAYER, "Shadow Bolt"); clock = clock + 2
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Mortal Strike"); clock = clock + 2; fire("PLAYER_DEAD")
      enemyHits("G2", "Vex", HOSTILE_PLAYER, "Shadow Bolt"); clock = clock + 11; fire("PLAYER_DEAD")`);
    expect(chat(lines)).toEqual(["Killed by Gorak (Orc Warrior) with Mortal Strike in Stranglethorn Vale - Booty Bay"]);
  });

  it("blames the last of two hitters landing in the same second", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Mortal Strike")
      enemyHits("G2", "Vex", HOSTILE_PLAYER, "Shadow Bolt"); fire("PLAYER_DEAD")`);
    expect(chat(lines)).toEqual(["Killed by Vex with Shadow Bolt in Stranglethorn Vale - Booty Bay"]);
  });

  it("ignores friendly, neutral and NPC sources, and your hits on them", () => {
    const lines = run(`
      enemyHits("F1", "Friend", FRIENDLY_PLAYER, "Smite"); enemyHits("N1", "Neutral", NEUTRAL_PLAYER, "Smite")
      enemyHits("M1", "Guard", HOSTILE_NPC, "Smite")
      youHit("F1", "Friend", FRIENDLY_PLAYER); youHit("M1", "Guard", HOSTILE_NPC); youKill("M1", "Guard", HOSTILE_NPC)
      fire("PLAYER_DEAD"); MGAPvPLog.Flush(clock + 1000)
      ${printRows()} ${say("#MGAPvPLogDB.log")}`);
    expect(chat(lines)).toEqual([]);
    expect(rowsOf(lines)).toEqual([]);
    expect(values(lines)).toEqual(["0"]);
  });

  it("counts a second death to the same player", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Cleave"); fire("PLAYER_DEAD"); clock = clock + 30
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Cleave"); fire("PLAYER_DEAD")
      ${printRows("killedMe")}`);
    expect(rowsOf(lines)).toHaveLength(2);
    expect(rowsOf(lines)[0]).toContain("killed you ×2");
    expect(rowsOf(lines)[0]).toContain("just now");
  });
});

describe("MGA PvP Log kills and fights", () => {
  it("marks your killing blow on a hostile player as I killed, with your last spell", () => {
    const lines = run(`${GORAK}
      youHit("G1", "Gorak", HOSTILE_PLAYER, "Fireball", 400); youKill("G1", "Gorak", HOSTILE_PLAYER)
      ${printRows("iKilled")} ${printRows("killedMe")}`);
    expect(rowsOf(lines)).toEqual(["Gorak  Orc Warrior | Stranglethorn Vale - Booty Bay · just now · You killed them with Fireball · you took 0, dealt 400 · you killed ×1"]);
  });

  it("calls a fight that went quiet for over a minute Fought, with the last spell they hit you with", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Backstab")
      clock = clock + 60; MGAPvPLog.Flush(clock); ${printRows()}
      clock = clock + 1; MGAPvPLog.Flush(clock); ${printRows()}`);
    expect(rowsOf(lines)).toEqual(["Gorak  Orc Warrior | Stranglethorn Vale - Booty Bay · 1 min ago · Fought, last hit with Backstab · you took 100, dealt 0"]);
  });

  it("ends fights on logout", () => {
    const lines = run(`enemyHits("G1", "Gorak", HOSTILE_PLAYER); fire("PLAYER_LOGOUT"); ${say("#MGAPvPLogDB.log")}`);
    expect(values(lines)).toEqual(["1"]);
  });

  it("lists newest first", () => {
    const lines = run(`
      youHit("A", "Ann", HOSTILE_PLAYER); youKill("A", "Ann", HOSTILE_PLAYER); clock = clock + 400
      youHit("B", "Bob", HOSTILE_PLAYER); youKill("B", "Bob", HOSTILE_PLAYER)
      ${printRows()}`);
    expect(rowsOf(lines).map((r) => r.split(" ")[0])).toEqual(["Bob", "Ann"]);
    expect(rowsOf(lines)[1]).toContain("6 min ago");
  });
});

describe("MGA PvP Log storage", () => {
  it("keeps the last 200 encounters and forgets the enemies of the dropped ones", () => {
    const lines = run(`
      for i = 1, 205 do youKill("G" .. i, "Enemy" .. i, HOSTILE_PLAYER); clock = clock + 1 end
      local n = 0; for _ in pairs(MGAPvPLogDB.enemies) do n = n + 1 end
      ${say("#MGAPvPLogDB.log")} ${say("n")} ${say("MGAPvPLogDB.enemies.G5")} ${say("MGAPvPLogDB.enemies.G6 ~= nil")} ${say("MGAPvPLogDB.log[1].guid")}`);
    expect(values(lines)).toEqual(["200", "200", "nil", "true", "G6"]);
  });

  it("saves per character as { version, settings, log, enemies }", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Backstab"); fire("PLAYER_DEAD")
      local d, e, l = MGAPvPLogDB, MGAPvPLogDB.enemies.G1, MGAPvPLogDB.log[1]
      ${say("d.version .. ' ' .. tostring(d.settings.chat) .. ' ' .. #d.log")}
      ${say("e.name .. ' ' .. e.race .. ' ' .. e.class .. ' ' .. e.classFile .. ' ' .. e.killedYou .. ' ' .. e.youKilled .. ' ' .. e.fights .. ' ' .. e.taken .. ' ' .. e.dealt")}
      ${say("l.guid .. ' ' .. l.outcome .. ' ' .. l.spell .. ' ' .. l.zone .. ' ' .. l.time .. ' ' .. l.taken .. ' ' .. l.dealt")}`);
    expect(values(lines)).toEqual([
      "1 true 1",
      "Gorak Orc Warrior WARRIOR 1 0 1 100 0",
      "G1 killedMe Backstab Stranglethorn Vale - Booty Bay 1000 100 0",
    ]);
  });

  it("keeps the log through a reload and drops it on Clear", () => {
    const lines = run(`
      youKill("G1", "Gorak", HOSTILE_PLAYER)
      local saved = MGAPvPLogDB; MGAPvPLog.Clear()
      ${say("#MGAPvPLogDB.log .. ' ' .. next(MGAPvPLogDB.enemies)")}`.replace("next(MGAPvPLogDB.enemies)", "tostring(next(MGAPvPLogDB.enemies))"));
    expect(values(lines)).toEqual(["0 nil"]);
  });
});

describe("MGA PvP Log window and settings", () => {
  it("opens from the MGA menu and /mgapvp, filters, and asks twice before clearing", () => {
    const lines = run(`${GORAK}
      youHit("G1", "Gorak", HOSTILE_PLAYER, "Fireball"); youKill("G1", "Gorak", HOSTILE_PLAYER)
      enemyHits("G3", "Vex", HOSTILE_PLAYER, "Frostbolt"); fire("PLAYER_DEAD")
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
    expect(v[2]).toMatch(/^\[I killed\] Gorak /);
    expect(v[2]).toMatch(/ false$/);
    expect(v[3]).toBe("Click again to clear 2");
    expect(v[4]).toBe("Clear log 2");
    expect(v[5]).toBe("0 true");
    expect(v[6]).toBe("false");
  });

  it("turns the death chat line off and on from the settings checkbox and /mgapvp chat, still logging the death", () => {
    const lines = run(`${GORAK}
      click(MGAPvPLogOptions_chat); ${say("MGAPvPLogDB.settings.chat")}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Backstab"); fire("PLAYER_DEAD"); ${say("#MGAPvPLogDB.log")}
      SlashCmdList.MGAPVPLOG("chat"); ${say("tostring(MGAPvPLogDB.settings.chat) .. ' ' .. tostring(MGAPvPLogOptions_chat.checked)")}
      clock = clock + 30; enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Backstab"); fire("PLAYER_DEAD")`);
    expect(values(lines)).toEqual(["false", "1", "true true"]);
    expect(chat(lines).filter((l) => !l.includes("is near you"))).toEqual([
      "death chat line on.",
      "Killed by Gorak (Orc Warrior) with Backstab in Stranglethorn Vale - Booty Bay",
    ]);
  });
});

const near = (lines: string[]): string[] => chat(lines).filter((l) => l.includes("is near you"));
const TRACK_GORAK = `${GORAK}; MGAPvPLog.SetTracked("Gorak", true)`;

describe("MGA PvP Log tracking", () => {
  it("adds whoever kills you to the list, with where you were, unless that setting is off", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Cleave"); ${say("MGAPvPLog.IsTracked('Gorak')")}
      fire("PLAYER_DEAD"); ${say("MGAPvPLog.IsTracked('Gorak')")}
      local seen = MGAPvPLogDB.tracked.gorak.seen
      ${say("seen.zone .. '|' .. seen.subzone .. '|' .. seen.map .. '|' .. string.format('%.0f,%.0f', seen.x, seen.y)")}
      MGAPvPLogDB.settings.autoTrack = false; enemyHits("G3", "Vex", HOSTILE_PLAYER, "Frostbolt"); fire("PLAYER_DEAD")
      ${say("MGAPvPLog.IsTracked('Vex')")}`);
    expect(values(lines)).toEqual(["false", "true", "Stranglethorn Vale|Booty Bay|1434|41,62", "false"]);
  });

  it("warns when a tracked player turns up in the combat log, as source or as target", () => {
    const lines = run(`${GORAK}
      MGAPvPLog.SetTracked("Gorak", true); MGAPvPLog.SetTracked("Vex", true)
      seenFighting("G1", "Gorak")
      clock = clock + 100
      youHit("G3", "Vex", HOSTILE_PLAYER)`);
    expect(near(lines)).toEqual([
      "Gorak is near you: Stranglethorn Vale - Booty Bay (41, 62)",
      "Vex is near you: Stranglethorn Vale - Booty Bay (41, 62)",
    ]);
  });

  it("describes the player in the warning: race, class, and how often they killed you", () => {
    const lines = run(`${GORAK}
      enemyHits("G1", "Gorak", HOSTILE_PLAYER, "Cleave"); fire("PLAYER_DEAD"); clock = clock + 30
      seenFighting("G1", "Gorak")`);
    expect(near(lines)).toEqual(["Gorak (Orc Warrior, killed you ×1) is near you: Stranglethorn Vale - Booty Bay (41, 62)"]);
  });

  it("notices a tracked player on a nameplate, as your target, on mouseover and as a group member's target", () => {
    const sources: Array<[string, string]> = [
      [`units["nameplate3"] = { name = "Gorak" }; fire("NAME_PLATE_UNIT_ADDED", "nameplate3")`, "nameplate"],
      [`units["target"] = { name = "Gorak" }; fire("PLAYER_TARGET_CHANGED")`, "target"],
      [`units["mouseover"] = { name = "Gorak" }; fire("UPDATE_MOUSEOVER_UNIT")`, "mouseover"],
      [`groupSize = 3; units["party2target"] = { name = "Gorak" }; MGAPvPLogEvents.scripts.OnUpdate(MGAPvPLogEvents, 6)`, "party"],
      [`groupSize = 3; inRaid = true; units["raid3target"] = { name = "Gorak" }; MGAPvPLogEvents.scripts.OnUpdate(MGAPvPLogEvents, 6)`, "raid"],
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

  it("ignores untracked players, non-player units and players you stop tracking", () => {
    const lines = run(`${GORAK}
      units["target"] = { name = "Gorak" }; fire("PLAYER_TARGET_CHANGED")
      MGAPvPLog.SetTracked("Gorak", true); units["target"] = { name = "Gorak", player = false }; fire("PLAYER_TARGET_CHANGED")
      units["target"] = { name = "Gorak" }; MGAPvPLog.SetTracked("Gorak", false); fire("PLAYER_TARGET_CHANGED")
      seenFighting("G1", "Gorak")`);
    expect(near(lines)).toEqual([]);
  });

  it("warns once a minute, again when they leave and come back, and updates where you saw them every time", () => {
    const lines = run(`${TRACK_GORAK}
      for i = 1, 13 do seenFighting("G1", "Gorak"); clock = clock + 5 end
      clock = clock + 25; subzone = "Nesingwary's Expedition"; mapX = 0.5; seenFighting("G1", "Gorak")
      local seen = MGAPvPLogDB.tracked.gorak.seen
      ${say("seen.subzone .. ' ' .. string.format('%.0f', seen.x) .. ' ' .. seen.time")}`);
    expect(near(lines)).toHaveLength(3);
    expect(values(lines)).toEqual(["Nesingwary's Expedition 50 1090"]);
  });

  it("plays a sound and shows a banner with each warning, unless that setting is off; the chat line stays", () => {
    const lines = run(`${TRACK_GORAK}
      seenFighting("G1", "Gorak"); ${say("sounds .. ' ' .. tostring(MGAPvPLogBanner.shownFlag) .. ' ' .. MGAPvPLogBannerText.text")}
      MGAPvPLogBanner.scripts.OnUpdate(MGAPvPLogBanner, 5); ${say("MGAPvPLogBanner.shownFlag")}
      MGAHub.OpenSettings(); click(MGAPvPLogOptions_alertFx); clock = clock + 100; seenFighting("G1", "Gorak")
      ${say("sounds .. ' ' .. tostring(MGAPvPLogBanner.shownFlag)")}`);
    expect(values(lines)).toEqual(["1 true Gorak is near you", "false", "1 false"]);
    expect(near(lines)).toHaveLength(2);
  });

  it("says no position when the client gives none, and the Tracked tab says so", () => {
    const lines = run(`${TRACK_GORAK}; mapId = nil
      seenFighting("G1", "Gorak"); SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogFilter4)
      ${say("MGAPvPLogRow1Detail.text")}`);
    expect(near(lines)).toEqual(["Gorak is near you: Stranglethorn Vale - Booty Bay"]);
    expect(values(lines)).toEqual(["You were in Stranglethorn Vale - Booty Bay · just now"]);
  });

  it("lists tracked players on their own tab and tracks or untracks from any row, and by /mgapvp track", () => {
    const lines = run(`${GORAK}
      SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogFilter4)
      ${say("MGAPvPLogEmpty.text .. ' ' .. tostring(MGAPvPLogEmpty.shownFlag)")}
      youHit("G1", "Gorak", HOSTILE_PLAYER, "Fireball"); youKill("G1", "Gorak", HOSTILE_PLAYER); click(MGAPvPLogFilter1)
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
    const seen = `seenFighting("G1", "Gorak"); SlashCmdList.MGAPVPLOG(""); click(MGAPvPLogFilter4)`;
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
