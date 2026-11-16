import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import addonLua from "../../addon/MGADungeonQuests/MGADungeonQuests.lua?raw";
import addonToc from "../../addon/MGADungeonQuests/MGADungeonQuests.toc?raw";
import addonData from "../../addon/MGADungeonQuests/Data.lua?raw";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { dungeonQuestsAddonDataLua } from "@/games/wow-forever/lib/dungeonQuestsAddon/dungeonQuestsAddonDataLua";
import { dungeonQuestsAddonZip } from "@/games/wow-forever/lib/dungeonQuestsAddon/dungeonQuestsAddonZip";
import { loadDungeonQuestsAddonDetails } from "@/games/wow-forever/lib/dungeonQuestsAddon/loadDungeonQuestsAddonDetails";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_DUNGEON_QUEST_STUBS } from "@/test/addonLua/wowDungeonQuestStubs.lua";

// Two Alliance lines for a warlock at Deadmines (a three-step line and a lone dungeon quest), a
// warrior-only one, a Leatherworking 225 one, a Horde one; Shadowfang Keep is Horde-only; Wailing Caverns needs level 25.
const FIXTURE = `
MGADungeonQuestsData = {
  {
    key = "the-deadmines", instanceId = 36, name = "The Deadmines", levelMin = 17, levelMax = 21, aliases = {"VC", "DM"},
    alliance = {
      {titles = {"The Defias Brotherhood"}, steps = {
        {id = 1, title = "Step One", level = 14, minLevel = 9, giver = "Gryan Stoutmantle", where = "Westfall 56.3, 47.5 (Sentinel Hill)", map = 1436, x = 56.3, y = 47.5, objectives = {"Collect 4 Gold Pickup Schedule"}, turnIn = "Gryan Stoutmantle"},
        {id = 2, title = "Step Two", level = 15, minLevel = 9, giver = "Gryan Stoutmantle", where = "Westfall 56.3, 47.5 (Sentinel Hill)", map = 1436, x = 56.3, y = 47.5},
        {id = 3, title = "The Defias Brotherhood", level = 22, minLevel = 14, dungeon = true, giver = "Gryan Stoutmantle", where = "Westfall 56.3, 47.5 (Sentinel Hill)", map = 1436, x = 56.3, y = 47.5, objectives = {"Kill Edwin VanCleef"}, turnIn = "Gryan Stoutmantle"},
      }},
      {titles = {"Collecting Memories"}, steps = {
        {id = 10, title = "Collecting Memories", level = 18, minLevel = 14, dungeon = true, giver = "Wilder Thistlenettle", where = "Stormwind City 65.1, 21.3", map = 9999, x = 65.1, y = 21.3, objectives = {"Collect 4 Miners' Union Card"}, turnIn = "Wilder Thistlenettle"},
      }},
      {titles = {"Warrior Only"}, classes = {"warrior"}, steps = {
        {id = 20, title = "Warrior Only", level = 20, minLevel = 15, dungeon = true},
      }},
      {titles = {"Wild Leather Armor"}, skill = {name = "Leatherworking", level = 225}, steps = {
        {id = 60, title = "Wild Leather Armor", level = 45, minLevel = 30, dungeon = true},
      }},
    },
    horde = {
      {titles = {"Horde Quest"}, steps = {{id = 30, title = "Horde Quest", level = 20, minLevel = 15, dungeon = true}}},
    },
  },
  {
    key = "shadowfang-keep", instanceId = 33, name = "Shadowfang Keep", levelMin = 22, levelMax = 30,
    horde = {{titles = {"Deathstalkers"}, steps = {{id = 40, title = "Deathstalkers", level = 25, minLevel = 18, dungeon = true}}}},
  },
  {
    key = "wailing-caverns", instanceId = 43, name = "Wailing Caverns", levelMin = 17, levelMax = 24,
    alliance = {{titles = {"Deep Quest"}, steps = {{id = 50, title = "Deep Quest", level = 27, minLevel = 25, dungeon = true, giver = "A Book", item = true}}}},
  },
}
`;

/** Runs the addon on the fixture, then `script` (setup + slash/fire calls); returns what it printed. */
function run(script: string, setup = ""): string[] {
  return runAddonLua(
    [
      ["Data.lua", FIXTURE],
      ["setup", setup],
      ["MGADungeonQuests.lua", addonLua],
      ["clear", "clear()"],
      ["test", script],
    ],
    WOW_DUNGEON_QUEST_STUBS,
  );
}

const window = (lines: string[]) => lines.filter((l) => l.startsWith("window: ")).map((l) => l.slice(8));

describe("MGA Dungeon Quests addon files", () => {
  it("Data.lua is the dungeon pages' quest lines (npx vitest run -u rewrites it)", async () => {
    const data = await loadDungeons();
    const details = await loadDungeonQuestsAddonDetails(data.dungeons);
    await expect(dungeonQuestsAddonDataLua(data.dungeons, details)).toMatchFileSnapshot("../../addon/MGADungeonQuests/Data.lua");
  }, 60_000);

  it("the real Data.lua loads and has Deadmines' Alliance lines with givers and where", () => {
    const lines = runAddonLua(
      [
        ["Data.lua", addonData],
        ["MGADungeonQuests.lua", addonLua],
        ["clear", "clear()"],
        ["test", 'slash("deadmines")'],
      ],
      WOW_DUNGEON_QUEST_STUBS,
    );
    const shown = window(lines);
    expect(shown[0]).toMatch(/^Deadmines {2}level/);
    expect(shown.some((l) => /^\d+\. /.test(l))).toBe(true);
    expect(shown.some((l) => /from .+, Westfall \d/.test(l))).toBe(true);
  });

  it("the toc loads Data.lua before the addon and saves its settings; the zip unzips into one folder", () => {
    expect(addonToc).toMatch(/## Interface: 16001/);
    expect(addonToc).toMatch(/## SavedVariables: MGADungeonQuestsSettings/);
    expect(addonToc.indexOf("Data.lua")).toBeLessThan(addonToc.indexOf("MGADungeonQuests.lua\n"));
    const files = unzipSync(dungeonQuestsAddonZip());
    expect(Object.keys(files).filter((name) => !name.endsWith("/")).sort()).toEqual([
      "MGADungeonQuests/Data.lua",
      "MGADungeonQuests/MGADungeonQuests.lua",
      "MGADungeonQuests/MGADungeonQuests.toc",
    ]);
    expect(strFromU8(files["MGADungeonQuests/MGADungeonQuests.lua"])).toBe(addonLua);
  });
});

describe("MGA Dungeon Quests checklist", () => {
  it("lists your faction's lines in order with who gives each and where, not another class's", () => {
    const shown = window(run('slash("deadmines")'));
    expect(shown).toEqual([
      "The Deadmines  levels 17-21",
      "1. The Defias Brotherhood  0 of 3 done",
      'Next: Get "Step One" from Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill).',
      "[todo] Step One (14)",
      "      from Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill)",
      "[todo] Step Two (15)",
      "      from Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill)",
      "[todo] The Defias Brotherhood (22)  (done in the dungeon)",
      "      from Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill)",
      "2. Collecting Memories  0 of 1 done",
      'Next: Get "Collecting Memories" from Wilder Thistlenettle, Stormwind City 65.1, 21.3.',
      "[todo] Collecting Memories (18)  (done in the dungeon)",
      "      from Wilder Thistlenettle, Stormwind City 65.1, 21.3",
      "Quest lines are Classic's; Forever may differ. Quests you turn in tick when the game records them.",
    ]);
  });

  it("ticks what the game says you've done, and a done step ticks the ones before it", () => {
    const shown = window(run('slash("deadmines")', "completed[2] = true"));
    expect(shown.slice(1, 6)).toEqual([
      "1. The Defias Brotherhood  2 of 3 done",
      'Next: Get "The Defias Brotherhood" from Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill).',
      "[done] Step One",
      "[done] Step Two",
      "[todo] The Defias Brotherhood (22)  (done in the dungeon)",
    ]);
  });

  it("marks quests in your log, and ready to turn in; all done says so", () => {
    const shown = window(
      run('slash("deadmines")', "completed[2] = true; completed[3] = true; questLog = { { id = 10, complete = true } }"),
    );
    expect(shown).toContain("1. The Defias Brotherhood  all done");
    expect(shown).toContain("[log] Collecting Memories (18)  (done in the dungeon)  ready to turn in");
    expect(shown).not.toContain("      from Wilder Thistlenettle, Stormwind City 65.1, 21.3");
    const inLog = window(run('slash("deadmines")', "questLog = { { id = 1 } }"));
    expect(inLog).toContain("[log] Step One (14)  in your quest log");
    const laterInLog = window(run('slash("deadmines")', "questLog = { { id = 2 } }"));
    expect(laterInLog.slice(1, 5)).toEqual([
      "1. The Defias Brotherhood  1 of 3 done",
      'Next: Finish "Step Two" (its goals are in your quest log). Then turn it in.',
      "[done] Step One",
      "[log] Step Two (15)  in your quest log",
    ]);
  });

  it("says what to do next: get it, finish its objectives, turn it in, or wait for a level", () => {
    const next = (setup: string, query = "deadmines") => window(run(`slash("${query}")`, setup)).filter((l) => l.startsWith("Next: "));
    expect(next("questLog = { { id = 1 } }")[0]).toBe(
      'Next: Finish "Step One": Collect 4 Gold Pickup Schedule. Then turn it in to Gryan Stoutmantle.',
    );
    expect(next("questLog = { { id = 1, complete = true } }")[0]).toBe('Next: Turn in "Step One" to Gryan Stoutmantle.');
    expect(next("completed[2] = true; questLog = { { id = 3 } }")[0]).toBe(
      'Next: Finish "The Defias Brotherhood" in the dungeon: Kill Edwin VanCleef. Then turn it in to Gryan Stoutmantle.',
    );
    expect(next("", "wailing")).toEqual(['Next: At level 25, get "Deep Quest" from the item A Book.']);
    expect(next('player.class = "WARRIOR"')).toContain("Next: Get \"Warrior Only\". Who gives it isn't in our data.");
    expect(next("completed[3] = true; completed[10] = true")).toEqual([]);
  });

  it("a Pin button beside a quest to pick up puts a map pin on its giver", () => {
    expect(run('slash("deadmines"); shownPins()')).toContain("pins: 1,2");
    expect(run('slash("deadmines"); shownPins()', "questLog = { { id = 1 } }")).toContain("pins: 2");
    expect(run('slash("deadmines"); shownPins()', "C_Map = nil")).toContain("pins: ");
    const pinned = run('slash("deadmines"); clear(); clickPin(1)');
    expect(pinned).toEqual([
      "waypoint: 1436 0.563 0.475",
      "supertrack: true",
      "chat: MGA Dungeon Quests: map pin on Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill). Open your map (M) to see it.",
    ]);
    expect(run('slash("deadmines"); clear(); clickPin(2)')).toEqual([
      "chat: MGA Dungeon Quests: the map can't take a pin there. Wilder Thistlenettle is at Stormwind City 65.1, 21.3.",
    ]);
    expect(run('slash("deadmines"); slash("list"); shownPins()')).toContain("pins: ");
  });

  it("a warrior gets the warrior's line; the Horde get theirs", () => {
    expect(window(run('slash("deadmines")', 'player.class = "WARRIOR"'))).toContain("3. Warrior Only  0 of 1 done");
    const horde = window(run('slash("deadmines")', 'player.faction = "Horde"'));
    expect(horde).toContain("1. Horde Quest  0 of 1 done");
    expect(horde.join("\n")).not.toMatch(/Defias/);
  });

  it("a profession line shows only to those with the profession, saying when their skill is too low", () => {
    const lw = (rank: number) => window(run('slash("deadmines")', `player.skills = { {name = "Leatherworking", rank = ${rank}} }`));
    expect(window(run('slash("deadmines")')).join(" ")).not.toMatch(/Wild Leather/);
    expect(lw(200)).toContain("3. Wild Leather Armor  0 of 1 done");
    expect(lw(200)).toContain("Needs Leatherworking 225 (you have 200)");
    expect(lw(230)).toContain("3. Wild Leather Armor  0 of 1 done");
    expect(lw(230).join(" ")).not.toMatch(/Needs Leatherworking/);
    expect(window(run('slash("deadmines")', "GetSkillLineInfo = nil"))).toContain("3. Wild Leather Armor  0 of 1 done");
    // Can't read the professions in full: hide nothing.
    expect(window(run('slash("deadmines")', "player.skillsCollapsed = true"))).toContain("3. Wild Leather Armor  0 of 1 done");
    expect(window(run('slash("deadmines")', 'player.locale = "deDE"'))).toContain("3. Wild Leather Armor  0 of 1 done");
  });

  it("says when a quest needs a higher level, and names an item that starts one", () => {
    const shown = window(run('slash("wailing")'));
    expect(shown).toContain("[todo] Deep Quest (27)  (done in the dungeon)  needs level 25");
    expect(shown).toContain("      from the item A Book");
  });

  it("finds a quest under a collapsed header by asking for it by id", () => {
    const viaIsOnQuest = window(run('slash("deadmines")', "C_QuestLog.IsOnQuest = function(id) return id == 2 end"));
    expect(viaIsOnQuest).toContain("[log] Step Two (15)  in your quest log");
    const viaIndex = window(
      run('slash("deadmines")', "C_QuestLog = nil; function GetQuestLogIndexByID(id) return id == 10 and 7 or 0 end; function IsQuestComplete(id) return id == 10 end"),
    );
    expect(viaIndex).toContain("[log] Collecting Memories (18)  (done in the dungeon)  ready to turn in");
  });

  it("works with the older quest log globals", () => {
    const shown = window(run('slash("deadmines")', "C_QuestLog = nil; completed[1] = true; questLog = { { id = 2 } }"));
    expect(shown).toContain("[done] Step One");
    expect(shown).toContain("[log] Step Two (15)  in your quest log");
    expect(shown).toContain("1. The Defias Brotherhood  1 of 3 done");
  });

  it("re-draws when you turn a quest in while it's open", () => {
    const lines = run('slash("deadmines"); clear(); completed[1] = true; fire("QUEST_TURNED_IN")');
    expect(window(lines)).toContain("[done] Step One");
  });
});

describe("MGA Dungeon Quests list and slash command", () => {
  it("the list shows dungeons with quests for you, how many to pick up; a row opens one, back returns", () => {
    const lines = run('slash("list")', 'questLog = { { id = 10 } }');
    expect(lines.filter((l) => l.startsWith("row: "))).toEqual([
      "row: The Deadmines  (levels 17-21) 3 quests to pick up",
      "row: Wailing Caverns  (levels 17-24) 1 quest to pick up",
    ]);
    const opened = run('slash("list"); clear(); clickRow(2)');
    expect(window(opened)[0]).toBe("Wailing Caverns  levels 17-24");
    const back = run('slash("wailing"); clear(); clickBack()');
    expect(back.filter((l) => l.startsWith("row: "))).toHaveLength(2);
  });

  it("/mgadq opens the dungeon you're in, else the list; an unknown name says so", () => {
    expect(window(run('instance = { type = "party", id = 36 }; slash("")'))[0]).toBe("The Deadmines  levels 17-21");
    expect(run('slash("")').filter((l) => l.startsWith("row: "))).toHaveLength(2);
    expect(window(run('slash("vc")'))[0]).toBe("The Deadmines  levels 17-21");
    expect(run('slash("zzz")')).toContain('chat: MGA Dungeon Quests: no dungeon matches "zzz". /mgadq list shows them all.');
  });

  it("entering a dungeon reminds you of quests you haven't picked up, until turned off", () => {
    expect(run('instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD")')).toEqual([
      "chat: MGA Dungeon Quests: The Deadmines: 4 quests for it you haven't picked up. /mgadq to see them.",
    ]);
    const allPicked = "completed[3] = true; questLog = { { id = 10 } }";
    expect(run('instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD")', allPicked)).toEqual([]);
    expect(run('fire("PLAYER_ENTERING_WORLD")')).toEqual([]);
    expect(run('slash("remind off"); clear(); instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD")')).toEqual([]);
  });

  it("reminds once per visit, not on a reload, and waits for the quest log when the client has timers", () => {
    const enter = 'instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD")';
    const leave = 'instance = nil; fire("PLAYER_ENTERING_WORLD")';
    expect(run(`${enter}; ${enter}`)).toHaveLength(1);
    expect(run(`${enter}; ${leave}; ${enter}`)).toHaveLength(2);
    expect(run('instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD", false, true)')).toEqual([]);
    const timers = "pending = {}; C_Timer = { After = function(_, fn) pending[#pending + 1] = fn end }";
    expect(run(enter, timers)).toEqual([]);
    expect(run(`${enter}; pending[1]()`, timers)).toHaveLength(1);
  });
});
