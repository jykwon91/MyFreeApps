import { describe, expect, it } from "vitest";
import addonLua from "../../addon/MGADungeonQuests/MGADungeonQuests.lua?raw";
import addonData from "../../addon/MGADungeonQuests/Data.lua?raw";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_DUNGEON_QUEST_STUBS } from "@/test/addonLua/wowDungeonQuestStubs.lua";

// Two writs and a normal quest in the log; the client marks writ 94219 in Durotar.
const SETUP = `
questLog = {
  { id = 94219, title = "Craftsman's Writ: Draught of Water Breathing", complete = false },
  { id = 94004, title = "Craftsman's Writ: Elixir of Ogre's Strength", complete = false },
  { id = 500, title = "Wolves Across the Border", complete = false },
}
player.faction = "Horde"
function date() return "2026-11-19" end
markers = { [94219] = { 1411, 0.5213, 0.4306 } }
C_QuestLog.GetNextWaypoint = function(id)
  local m = markers[id]
  if m then return m[1], m[2], m[3] end
end
local mapInfo = C_Map.GetMapInfo
C_Map.GetMapInfo = function(id)
  local info = mapInfo(id)
  info.name = ({ [1411] = "Durotar", [1413] = "The Barrens" })[id]
  return info
end
function spots(id)
  for _, s in ipairs(MGADungeonQuestsSettings.writSpots[id] or {}) do
    out[#out + 1] = string.format("spot: %s %d %.1f %.1f %s %s", s.zone, s.map, s.x, s.y, s.seen, s.faction)
  end
end
`;

function run(script: string, setup = ""): string[] {
  return runAddonLua(
    [
      ["Data.lua", addonData],
      ["TurnIns.lua", "MGADungeonQuestsTurnIns = {}"],
      ["setup", `${SETUP}; ${setup}`],
      ["MGADungeonQuests.lua", addonLua],
      ["load", 'fire("PLAYER_ENTERING_WORLD", false, true)'],
      ["clear", "clear()"],
      ["test", script],
    ],
    WOW_DUNGEON_QUEST_STUBS,
  );
}

const chat = (lines: string[]) => lines.filter((l) => l.startsWith("chat: ")).map((l) => l.replace("chat: MGA Dungeon Quests: ", ""));

describe("MGA Dungeon Quests writ spots", () => {
  it("notes where a writ in your log goes, once, from the client's map marker", () => {
    const lines = run("fire('QUEST_LOG_UPDATE'); fire('QUEST_LOG_UPDATE'); spots(94219); spots(500)");
    expect(chat(lines)).toEqual(["noted where Craftsman's Writ: Draught of Water Breathing goes: Durotar 52.1, 43.1."]);
    expect(lines.filter((l) => l.startsWith("spot: "))).toEqual(["spot: Durotar 1411 52.1 43.1 2026-11-19 horde"]);
  });

  it("a writ the client hasn't marked is noted once it is, and only quests named as writs count", () => {
    const lines = run(
      "fire('QUEST_LOG_UPDATE'); markers[94004] = { 1413, 0.6, 0.3 }; markers[500] = { 1413, 0.1, 0.1 }; slash('writs'); spots(94004); spots(500)",
    );
    expect(chat(lines)).toEqual([
      "noted where Craftsman's Writ: Draught of Water Breathing goes: Durotar 52.1, 43.1.",
      "noted where Craftsman's Writ: Elixir of Ogre's Strength goes: The Barrens 60.0, 30.0.",
      "2 writs noted so far. Pick up a writ and it's noted on its own; the site's Crafting writs page shows them after the next data refresh.",
    ]);
    expect(lines.filter((l) => l.startsWith("spot: "))).toEqual(["spot: The Barrens 1413 60.0 30.0 2026-11-19 horde"]);
  });

  it("/mgadq writs names the writs the game hasn't marked yet", () => {
    const said = chat(run("slash('writs')", "markers = {}"));
    expect(said).toEqual([
      "0 writs noted so far. Pick up a writ and it's noted on its own; the site's Crafting writs page shows them after the next data refresh.",
      "the game hasn't marked where these go yet: Craftsman's Writ: Draught of Water Breathing, Craftsman's Writ: Elixir of Ogre's Strength.",
    ]);
  });

  it("the same place seen again only refreshes its date; a new place is added", () => {
    const setup = `MGADungeonQuestsSettings = { writSpots = { [94219] = {
      { zone = "Durotar", map = 1411, x = 52.4, y = 43.0, seen = "2026-11-01", faction = "horde" },
      { zone = "Orgrimmar", map = 1454, x = 50, y = 50, seen = "2026-11-01", faction = "horde" },
    } } }`;
    const lines = run("fire('QUEST_LOG_UPDATE'); spots(94219)", setup);
    expect(chat(lines)).toEqual([]);
    expect(lines.filter((l) => l.startsWith("spot: "))).toEqual([
      "spot: Durotar 1411 52.4 43.0 2026-11-19 horde",
      "spot: Orgrimmar 1454 50.0 50.0 2026-11-01 horde",
    ]);
  });

  it("falls back to the quests the client lists on each zone map", () => {
    const setup = `C_QuestLog.GetNextWaypoint = nil
      C_Map.GetMapChildrenInfo = function(parent, kind) if parent == 947 and kind == 3 then return { { mapID = 1411 }, { mapID = 1413 } } end end
      C_QuestLog.GetQuestsOnMap = function(map) if map == 1413 then return { { questID = 94004, x = 0.25, y = 0.75 } } end end`;
    expect(chat(run("fire('QUEST_LOG_UPDATE')", setup))).toEqual(["noted where Craftsman's Writ: Elixir of Ogre's Strength goes: The Barrens 25.0, 75.0."]);
  });
  it("a writ seen before its map or faction is known is tried again, not dropped", () => {
    const lines = run(
      "fire('QUEST_LOG_UPDATE'); player.faction = 'Horde'; slash('writs'); spots(94219)",
      "player.faction = nil",
    );
    expect(chat(lines)[0]).toBe("noted where Craftsman's Writ: Draught of Water Breathing goes: Durotar 52.1, 43.1.");
    expect(lines.filter((l) => l.startsWith("spot: "))).toEqual(["spot: Durotar 1411 52.1 43.1 2026-11-19 horde"]);
  });
});
