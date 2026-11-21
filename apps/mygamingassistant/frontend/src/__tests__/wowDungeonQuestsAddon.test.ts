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
    players = 10, art = {button = 522352, lore = 526404},
    bosses = {
      {name = "Rhahk'Zor", portrait = 522000, loot = {
        {id = 872, name = "Rockslicer", slot = "Two-Hand", kind = "Axe", chance = 16.2},
        {id = 5187, name = "Rhahk'Zor's Hammer", slot = "Two-Hand", kind = "Mace", chance = 0.4},
      }},
      {name = "Miner Johnson"},
      {name = "Edwin VanCleef", portrait = 522001, loot = {{id = 5191, name = "Cruel Barb", slot = "One-Hand", kind = "Sword", chance = 20}}},
    },
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
    key = "shadowfang-keep", instanceId = 33, name = "Shadowfang Keep", levelMin = 22, levelMax = 30, isNew = true,
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

  it("the toc loads Data.lua and TurnIns.lua before the addon and saves its settings; the zip unzips into one folder", () => {
    expect(addonToc).toMatch(/## Interface: 16001/);
    expect(addonToc).toMatch(/## SavedVariables: MGADungeonQuestsSettings/);
    expect(addonToc.indexOf("Data.lua")).toBeLessThan(addonToc.indexOf("MGADungeonQuests.lua\n"));
    expect(addonToc.indexOf("TurnIns.lua")).toBeLessThan(addonToc.indexOf("MGADungeonQuests.lua\n"));
    const files = unzipSync(dungeonQuestsAddonZip());
    expect(Object.keys(files).filter((name) => !name.endsWith("/")).sort()).toEqual([
      "MGADungeonQuests/Data.lua",
      "MGADungeonQuests/MGADungeonQuests.lua",
      "MGADungeonQuests/MGADungeonQuests.toc",
      "MGADungeonQuests/TurnIns.lua",
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

describe("MGA Dungeon Quests journal pages", () => {
  const only = (lines: string[], prefix: string) => lines.filter((l) => l.startsWith(prefix));

  it("a dungeon opens on its quests with its bosses down the left, portraits falling back to the default", () => {
    const lines = run('slash("deadmines"); shownBosses(); shownCrumbs()');
    expect(window(lines)[0]).toBe("The Deadmines  levels 17-21");
    expect(only(lines, "boss: ")).toEqual([
      "boss: Rhahk'Zor | portrait 522000",
      "boss: Miner Johnson | portrait 521744",
      "boss: Edwin VanCleef | portrait 522001",
    ]);
    expect(lines).toContain("crumbs: Home > The Deadmines");
  });

  it("a boss opens its loot, with the chance per kill; the dungeon's name goes back to all of it", () => {
    const boss = run('slash("deadmines"); clear(); clickBoss(1); shownLoot(); shownCrumbs()');
    expect(window(boss)).toEqual(["Rhahk'Zor", "Drop chances are Classic's; Forever may differ."]);
    expect(only(boss, "loot: ")).toEqual([
      "loot: Rockslicer | Two-Hand, Axe | 16%",
      "loot: Rhahk'Zor's Hammer | Two-Hand, Mace | 0.4%",
    ]);
    expect(boss).toContain("crumbs: Home > The Deadmines > Rhahk'Zor");
    const all = run('slash("deadmines"); clickBoss(1); clear(); clickCrumb(); shownLoot(); shownCrumbs()');
    expect(window(all)[0]).toBe("The Deadmines loot");
    expect(only(all, "loot: ")).toEqual([
      "loot: Rockslicer | Two-Hand, Axe - Rhahk'Zor | 16%",
      "loot: Rhahk'Zor's Hammer | Two-Hand, Mace - Rhahk'Zor | 0.4%",
      "loot: Cruel Barb | One-Hand, Sword - Edwin VanCleef | 20%",
    ]);
    expect(all).toContain("crumbs: Home > The Deadmines");
  });

  it("a boss with no loot says so, and leaving the Loot tab clears the boss", () => {
    expect(window(run('slash("deadmines"); clear(); clickBoss(2)'))).toEqual(["Miner Johnson", "No loot listed here."]);
    const quests = run('slash("deadmines"); clickBoss(1); clear(); clickTab(1); shownLoot(); shownCrumbs()');
    expect(window(quests)[0]).toBe("The Deadmines  levels 17-21");
    expect(only(quests, "loot: ")).toEqual([]);
    expect(quests).toContain("crumbs: Home > The Deadmines");
  });

  it("the Overview tab gives the dungeon's facts", () => {
    expect(window(run('slash("deadmines"); clear(); clickTab(2)'))).toEqual(["The Deadmines", "Levels 17-21", "Up to 10 players", "3 bosses", "4 quests to pick up"]);
    expect(window(run('slash("shadowfang"); clear(); clickTab(2)'))).toEqual(["Shadowfang Keep", "Levels 22-30", "New in WoW Forever"]);
  });

  it("a Pin button doesn't follow you to another tab, even with a line before it that has none", () => {
    const pins = run('slash("deadmines"); shownPins(); clickTab(3); shownPins()', "questLog = { { id = 1 } }");
    expect(pins.filter((l) => l.startsWith("pins: "))).toEqual(["pins: 2", "pins: "]);
  });

  it("colours an item by its quality under either name the client has for item info", () => {
    const colours = "ITEM_QUALITY_COLORS = { [3] = { hex = '|cff0070dd' } }";
    const script = 'slash("deadmines"); clickBoss(1); shownLootColours()';
    const seen = (setup: string) => run(script, `${colours}; ${setup}`).filter((l) => l.startsWith("colour: "));
    expect(seen("function GetItemInfo() return 'Rockslicer', 'link', 3 end")[0]).toBe("colour: |cff0070ddRockslicer|r");
    expect(seen("C_Item = { GetItemInfo = function() return 'Rockslicer', 'link', 3 end }")[0]).toBe("colour: |cff0070ddRockslicer|r");
    expect(seen("")[0]).toBe("colour: Rockslicer");
  });

  it("redraws the Loot tab once when a batch of items arrives, and leaves other tabs alone", () => {
    const timers = "pending = {}; C_Timer = { After = function(_, fn) pending[#pending + 1] = fn end }";
    const arrive = 'clear(); fire("GET_ITEM_INFO_RECEIVED"); fire("GET_ITEM_INFO_RECEIVED")';
    const onLoot = run(`slash("deadmines"); clickBoss(1); ${arrive}; out[#out + 1] = "queued: " .. #pending; pending[1]()`, timers);
    expect(onLoot).toContain("queued: 1");
    expect(window(onLoot)[0]).toBe("Rhahk'Zor");
    expect(window(run(`slash("deadmines"); ${arrive}`))).toEqual([]);
  });

  it("a dungeon with no quests for you still opens, and says so", () => {
    expect(window(run('slash("shadowfang")'))).toContain("No quests to pick up for this dungeon for your faction and class.");
  });

  it("every dungeon in the real Data.lua is on the grid, with bosses", () => {
    const lines = runAddonLua(
      [
        ["Data.lua", addonData],
        ["MGADungeonQuests.lua", addonLua],
        ["clear", "clear()"],
        ["test", 'slash("list"); shownRows(); slash("deadmines"); shownBosses(); clickBoss(1); shownLoot()'],
      ],
      WOW_DUNGEON_QUEST_STUBS,
    );
    expect(only(lines, "row: ").length).toBeGreaterThanOrEqual(28);
    expect(only(lines, "boss: ").length).toBeGreaterThan(3);
    expect(lines.some((l) => l.startsWith("boss: ") && !l.endsWith("portrait 521744"))).toBe(true);
  });
});

describe("MGA Dungeon Quests routes", () => {
  const STORMWIND = "position = { x = -8832.8, y = 478.6, c = 0 }";
  const SENTINEL_HILL = "position = { x = -10628.9, y = 1036.7, c = 0 }";
  const TELDRASSIL = "{ giver = 'Someone', where = 'Darnassus', map = 1457, x = 40, y = 50 }";

  function runReal(script: string, setup = ""): string[] {
    return runAddonLua(
      [
        ["Data.lua", addonData],
        ["setup", setup],
        ["MGADungeonQuests.lua", addonLua],
        ["clear", "clear()"],
        ["test", script],
      ],
      WOW_DUNGEON_QUEST_STUBS,
    );
  }
  const chat = (lines: string[]) => lines.filter((l) => l.startsWith("chat: "));
  const toDoor = 'slash("deadmines"); clickTab(2); clear(); clickDoorRoute()';

  it("routes from where you stand by flight, then on foot, and pins the first leg", () => {
    const lines = runReal(`${toDoor}; shownRoute()`, STORMWIND);
    expect(chat(lines).join("\n")).toContain("1. Take the flight to Sentinel Hill, Westfall");
    expect(chat(lines).join("\n")).toContain("2. Walk to Deadmines entrance, Westfall");
    expect(lines.find((l) => l.startsWith("route: "))).toContain("1 of 2: Take the flight to Sentinel Hill, Westfall");
    expect(lines.some((l) => l.startsWith("waypoint: 1436 "))).toBe(true);
  });

  it("moves to the next leg as you arrive, and ends at the last", () => {
    const landed = runReal(`${toDoor}; ${SENTINEL_HILL}; clear(); tickRoute(); shownRoute()`, STORMWIND);
    expect(landed.find((l) => l.startsWith("route: "))).toContain("2 of 2: Walk to Deadmines entrance");
    const there = runReal(
      `${toDoor}; local d = MGADungeonQuests.Find("deadmines").door; local s = MGADungeonQuestsTravel.zones[d.map];
       position = { x = s[3] - d.y / 100 * (s[3] - s[2]), y = s[5] - d.x / 100 * (s[5] - s[4]), c = s[1] };
       clear(); tickRoute(); shownRoute()`,
      STORMWIND,
    );
    expect(there).toContain("chat: MGA Dungeon Quests: you've reached Deadmines entrance.");
    expect(there).toContain("route: none");
    expect(there).toContain("waypoint cleared");
  });

  it("Stop ends the route and takes the pin away", () => {
    const lines = runReal(`${toDoor}; clear(); clickRouteStop(); shownRoute()`, STORMWIND);
    expect(lines).toEqual(["waypoint cleared", "route: none"]);
  });

  it("crosses the sea on what your faction can ride", () => {
    const alliance = chat(runReal(`MGADungeonQuests.StartRoute(${TELDRASSIL})`, STORMWIND)).join("\n");
    expect(alliance).toContain("Take the boat to");
    const horde = chat(
      runReal(`MGADungeonQuests.StartRoute(${TELDRASSIL})`, `player.faction = "Horde"; position = { x = 1500, y = 300, c = 0 }`),
    ).join("\n");
    expect(horde).toContain("Take the zeppelin to");
    expect(horde).not.toContain("Take the boat to Auberdine");
  });

  it("flies only the paths you know, once a flight master has shown them", () => {
    const taxi = "C_TaxiMap = { GetAllTaxiNodes = function() return { { nodeID = 2, state = 0 }, { nodeID = 4, state = 2 } } end }";
    const lines = runReal(`fire("TAXIMAP_OPENED"); ${toDoor}`, `${STORMWIND}; ${taxi}`);
    expect(chat(lines).join("\n")).not.toContain("Take the flight");
    expect(chat(lines).join("\n")).toContain("1. Walk to Deadmines entrance");
    const known = "C_TaxiMap = { GetAllTaxiNodes = function() return { { nodeID = 2, state = 0 }, { nodeID = 4, state = 1 } } end }";
    const flown = chat(runReal(`fire("TAXIMAP_OPENED"); ${toDoor}`, `${STORMWIND}; ${known}`)).join("\n");
    expect(flown).toContain("1. Take the flight to Sentinel Hill, Westfall");
    expect(flown).not.toContain("It counts every flight path");
  });

  it("only warns about flight paths when the route flies", () => {
    expect(chat(runReal(toDoor, STORMWIND)).join("\n")).toContain("It counts every flight path");
    const onFoot = `MGADungeonQuests.StartRoute({ giver = 'Near', where = 'Stormwind', map = 1453, x = 66, y = 66 })`;
    expect(chat(runReal(onFoot, STORMWIND)).join("\n")).not.toContain("It counts every flight path");
  });

  it("a new route that can only pin ends the one you were on", () => {
    const lines = runReal(`${toDoor}; position = nil; clear(); MGADungeonQuests.StartRoute(${TELDRASSIL}); shownRoute()`, STORMWIND);
    expect(lines).toContain("route: none");
    expect(lines).toContain("chat: MGA Dungeon Quests: map pin on Someone, Darnassus. Open your map (M) to see it.");
  });

  it("going into an instance ends the route; a loading screen out in the world plans it again", () => {
    const inside = runReal(`${toDoor}; position = nil; instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD"); shownRoute()`, STORMWIND);
    expect(inside).toContain("route: none");
    const moved = runReal(`${toDoor}; ${SENTINEL_HILL}; clear(); fire("PLAYER_ENTERING_WORLD"); shownRoute()`, STORMWIND);
    expect(moved.find((l) => l.startsWith("route: "))).toContain("1 of 1: Walk to Deadmines entrance");
  });

  it("leaves a pin of your own alone when no route pinned anything", () => {
    expect(run("MGADungeonQuests.StopRoute()")).not.toContain("waypoint cleared");
  });

  it("sends you to the giver, then who takes it back, then the dungeon's door", () => {
    const script = `
      local d = { name = "Deadmines", door = { map = 1436, x = 42, y = 71, where = "Westfall 42.0, 71.0" } }
      local step = { giver = "Gryan", where = "W", map = 1436, x = 56, y = 47, dungeon = true, turnIn = "Wilder", turnInWhere = "SW", turnInMap = 1453, turnInX = 65, turnInY = 21 }
      for _, state in ipairs({ false, true, "complete" }) do out[#out + 1] = "target: " .. MGADungeonQuests.RouteTarget(step, state, d).giver end
      out[#out + 1] = "no spot: " .. tostring(MGADungeonQuests.RouteTarget({ title = "x" }, "complete", d))`;
    expect(run(script).filter((l) => /^(target|no spot)/.test(l))).toEqual([
      "target: Gryan",
      "target: Deadmines entrance",
      "target: Wilder",
      "no spot: nil",
    ]);
  });

  it("inside an instance it falls back to a map pin", () => {
    const lines = runReal(toDoor);
    expect(chat(lines).join("\n")).toContain("map pin on Deadmines entrance");
    expect(runReal(`${toDoor}; shownRoute()`).filter((l) => l.startsWith("route: "))).toEqual(["route: none"]);
  });
});

describe("MGA Dungeon Quests list and slash command", () => {
  it("the grid shows every dungeon, how many quests to pick up and its art; a button opens one, Home returns", () => {
    const lines = run('slash("list"); shownRows()', "questLog = { { id = 10 } }");
    expect(lines.filter((l) => l.startsWith("row: "))).toEqual([
      "row: The Deadmines | levels 17-21 | 3 quests to pick up | art 522352",
      "row: Shadowfang Keep | levels 22-30 |  | art 521746",
      "row: Wailing Caverns | levels 17-24 | 1 quest to pick up | art 521746",
    ]);
    const opened = run('slash("list"); clear(); clickRow(3)');
    expect(window(opened)[0]).toBe("Wailing Caverns  levels 17-24");
    const back = run('slash("wailing"); clear(); clickBack(); shownRows()');
    expect(back.filter((l) => l.startsWith("row: "))).toHaveLength(3);
  });

  it("/mgadq opens the dungeon you're in, else the list; an unknown name says so", () => {
    expect(window(run('instance = { type = "party", id = 36 }; slash("")'))[0]).toBe("The Deadmines  levels 17-21");
    expect(run('slash(""); shownRows()').filter((l) => l.startsWith("row: "))).toHaveLength(3);
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

describe("MGA Dungeon Quests dungeon focus", () => {
  const enter = 'instance = { type = "party", id = 36 }; fire("PLAYER_ENTERING_WORLD")';
  const leave = 'instance = nil; fire("PLAYER_ENTERING_WORLD")';
  const vanCleef = 'questLog = { { id = 3, title = "The Defias Brotherhood", objectives = { { "Edwin VanCleef slain: 0/1", false } } } }';
  const focus = (lines: string[]) => lines.filter((l) => l.startsWith("focus"));
  const chat = (lines: string[]) => lines.filter((l) => l.startsWith("chat: ") && !l.includes("haven't picked up"));

  it("inside a dungeon, tracks only its quests: objectives live from the quest log, then what's done", () => {
    const setup = `questLog = {
      { id = 3, objectives = { { "Edwin VanCleef slain: 0/1", false } } },
      { id = 10, complete = true },
    }`;
    expect(focus(run(`${enter}; clear(); shownFocus()`, setup))).toEqual([
      "focus: The Deadmines quests",
      "focus| To do here",
      "focus| The Defias Brotherhood",
      "focus|    - Edwin VanCleef slain: 0/1",
      "focus| Done - turn in when you're out",
      "focus| [done] Collecting Memories",
    ]);
  });

  it("names the dungeon's quests you never picked up, with who gives them and where", () => {
    expect(focus(run(`${enter}; clear(); shownFocus()`))).toEqual([
      "focus: The Deadmines quests",
      "focus| Not picked up - you'd miss these",
      "focus| The Defias Brotherhood",
      "focus|    from Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill)",
      "focus| Collecting Memories",
      "focus|    from Wilder Thistlenettle, Stormwind City 65.1, 21.3",
    ]);
  });

  it("ticks an objective as you finish it, and says when everything is done", () => {
    const progress = `${enter}; questLog[1].objectives[1] = { "Edwin VanCleef slain: 1/1", true }; fire("QUEST_LOG_UPDATE"); clear(); shownFocus()`;
    expect(focus(run(progress, `${vanCleef}; completed[10] = true`))).toContain("focus|    [done] Edwin VanCleef slain: 1/1");
    expect(focus(run(`${enter}; clear(); shownFocus()`, "completed[3] = true; completed[10] = true"))).toEqual([
      "focus: The Deadmines quests",
      "focus| Every quest for this dungeon is done.",
    ]);
  });

  it("falls back to the quest's objectives from our data when the client can't list them", () => {
    const old = `${vanCleef}; C_QuestLog.GetQuestObjectives = nil; completed[10] = true`;
    expect(focus(run(`${enter}; clear(); shownFocus()`, old))).toContain("focus|    - Kill Edwin VanCleef");
    const leaderBoards = `${old}; function GetNumQuestLeaderBoards() return 1 end
      function GetQuestLogLeaderBoard() return "Edwin VanCleef slain: 0/1", "monster", nil end`;
    expect(focus(run(`${enter}; clear(); shownFocus()`, leaderBoards))).toContain("focus|    - Edwin VanCleef slain: 0/1");
  });

  it("shows nothing out in the world, or in a dungeon with no quests for you", () => {
    expect(focus(run('fire("PLAYER_ENTERING_WORLD"); shownFocus()'))).toEqual(["focus: none"]);
    expect(focus(run('instance = { type = "party", id = 43 }; player.level = 1; fire("PLAYER_ENTERING_WORLD"); shownFocus()'))).not.toEqual(["focus: none"]);
    expect(focus(run('instance = { type = "party", id = 33 }; fire("PLAYER_ENTERING_WORLD"); shownFocus()'))).toEqual(["focus: none"]);
  });

  it("the quest tracker shows only the dungeon's quests inside, a quest picked up there joins, and it goes back on leaving", () => {
    const setup = 'questLog = { { id = 99 }, { id = 3 } }; watched = { 99, 3 }';
    expect(run(`${enter}; clear(); shownWatched()`, setup)).toEqual(["watched: 3"]);
    expect(run(`${enter}; questLog[3] = { id = 10 }; fire("QUEST_ACCEPTED", 3, 10); clear(); shownWatched()`, setup)).toEqual([
      "watched: 3,10",
    ]);
    expect(run(`${enter}; questLog[3] = { id = 10 }; fire("QUEST_ACCEPTED", 3, 10); ${leave}; clear(); shownWatched()`, setup)).toContain(
      "watched: 3,99",
    );
  });

  it("a reload inside keeps what the tracker showed before the dungeon", () => {
    const setup = 'questLog = { { id = 99 }, { id = 3 } }; watched = { 99 }';
    const reload = 'fire("PLAYER_ENTERING_WORLD", false, true)';
    expect(run(`${enter}; ${reload}; ${leave}; clear(); shownWatched()`, setup)).toContain("watched: 99");
  });

  it("after a boss dies, says what's still to do; after the last boss, on screen too", () => {
    const kill = (boss: string) => `${enter}; clear(); fire("ENCOUNTER_END", 1, "${boss}", 1, 5, 1)`;
    expect(run(kill("Rhahk'Zor"), vanCleef)).toEqual([
      "chat: MGA Dungeon Quests: Still to do in The Deadmines: The Defias Brotherhood (Edwin VanCleef slain: 0/1).",
    ]);
    expect(run(kill("Edwin VanCleef"), vanCleef)).toEqual([
      "chat: MGA Dungeon Quests: don't leave yet. Still to do in The Deadmines: The Defias Brotherhood (Edwin VanCleef slain: 0/1).",
      "warning: Don't leave yet: 1 quest unfinished here",
    ]);
    expect(run(`${kill("Edwin VanCleef")}`, "questLog = { { id = 3, complete = true } }")).toEqual([]);
    expect(run(`${enter}; clear(); fire("ENCOUNTER_END", 1, "Edwin VanCleef", 1, 5, 0)`, vanCleef)).toEqual([]);
  });

  it("leaving with a quest unfinished says what, and leaving with them done says nothing", () => {
    expect(run(`${enter}; clear(); ${leave}`, vanCleef)).toEqual([
      "chat: MGA Dungeon Quests: you left The Deadmines with these unfinished: The Defias Brotherhood (Edwin VanCleef slain: 0/1).",
      "warning: You left The Deadmines with quests unfinished",
    ]);
    expect(chat(run(`${enter}; clear(); ${leave}`, "questLog = { { id = 3, complete = true } }"))).toEqual([]);
  });

  it("/mgadq focus off turns it all off and gives the tracker back; the X hides it for this visit only", () => {
    const setup = `${vanCleef}; questLog[2] = { id = 99 }; watched = { 99 }`;
    expect(run(`${enter}; slash("focus off"); clear(); shownFocus(); shownWatched(); ${leave}`, setup)).toEqual([
      "focus: none",
      "watched: 99",
    ]);
    expect(run('slash("focus off")')).toEqual(["chat: MGA Dungeon Quests: dungeon focus off."]);
    expect(focus(run(`${enter}; clickFocusClose(); fire("QUEST_LOG_UPDATE"); clear(); shownFocus()`, vanCleef))).toEqual(["focus: none"]);
    expect(focus(run(`${enter}; clickFocusClose(); ${leave}; ${enter}; clear(); shownFocus()`, vanCleef))[0]).toBe("focus: The Deadmines quests");
  });
});
