import { describe, expect, it } from "vitest";
import addonLua from "../../addon/MGADungeonQuests/MGADungeonQuests.lua?raw";
import addonData from "../../addon/MGADungeonQuests/Data.lua?raw";
import turnInsData from "../../addon/MGADungeonQuests/TurnIns.lua?raw";
import { loadTurnInSpots } from "@/games/wow-forever/lib/dungeonQuestsAddon/loadTurnInSpots";
import { turnInSpots } from "@/games/wow-forever/lib/dungeonQuestsAddon/turnInSpots";
import { turnInsDataLua } from "@/games/wow-forever/lib/dungeonQuestsAddon/turnInsDataLua";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_DUNGEON_QUEST_STUBS } from "@/test/addonLua/wowDungeonQuestStubs.lua";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";

const giver = (id: number, name: string, zone: number, x: number, y: number, instance: number | null = null) =>
  ["npc", id, name, zone, "Somewhere", x, y, instance];

function shard(quests: Record<string, unknown[]>): QuestDetailFile {
  return {
    source: {},
    questColumns: ["id", "givers", "enders"],
    giverColumns: ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"],
    objectiveColumns: [],
    targetColumns: [],
    stepColumns: [],
    quests,
    targets: {},
    steps: {},
  };
}

describe("MGA Dungeon Quests turn-in data", () => {
  it("TurnIns.lua is every quest's turn-in spot (npx vitest run -u rewrites it)", async () => {
    await expect(turnInsDataLua(await loadTurnInSpots())).toMatchFileSnapshot("../../addon/MGADungeonQuests/TurnIns.lua");
  }, 60_000);

  it("places a quest's one ender where that NPC, by id, gives a quest out in the world", () => {
    const spots = turnInSpots(
      [
        shard({ "1": [1, [giver(234, "Gryan Stoutmantle", 1436, 56.3, 47.5)], ["npc:234"]] }),
        shard({
          "2": [2, [], ["npc:234"]],
          "3": [3, [], ["npc:999"]], // the ender never gives a quest: unknown
          "4": [4, [], ["npc:234", "npc:235"]], // two enders: which one?
          "5": [5, [giver(300, "Inside", 1436, 10, 10, 36)], ["npc:300"]], // only inside a dungeon
        }),
      ],
      new Map([[1436, "Westfall"]]),
    );
    expect([...spots.keys()].sort()).toEqual([1, 2]);
    expect(spots.get(2)).toEqual({ name: "Gryan Stoutmantle", zoneId: 1436, zoneName: "Westfall", subzone: "Somewhere", x: 56.3, y: 47.5 });
  });

  it("the real TurnIns.lua sends Westfall's Sentinel Hill quests to Gryan Stoutmantle", () => {
    expect(turnInsData).toMatch(/^ {2}\[\d+\] = \{"Gryan Stoutmantle", 1436, 56\.\d, 47\.\d, "Westfall 56\.\d, 47\.\d \(Sentinel Hill\)"\},$/m);
  });
});

describe("MGA Dungeon Quests turn-ins", () => {
  // Stormwind's Trade District, and four finished quests: two for one NPC in Westfall, one in Stormwind, one in Elwynn.
  const STORMWIND = "position = { x = -8832.8, y = 478.6, c = 0 }";
  const SPOTS = `MGADungeonQuestsTurnIns = {
    [101] = {"Gryan Stoutmantle", 1436, 56.3, 47.5, "Westfall 56.3, 47.5 (Sentinel Hill)"},
    [102] = {"Gryan Stoutmantle", 1436, 56.3, 47.5, "Westfall 56.3, 47.5 (Sentinel Hill)"},
    [103] = {"Stormwind Clerk", 1453, 62, 70, "Stormwind City 62.0, 70.0"},
    [104] = {"Marshal Dughan", 1429, 42.1, 65.9, "Elwynn Forest 42.1, 65.9 (Goldshire)"},
  }`;
  const LOG = `questLog = {
    { id = 101, title = "The Defias Brotherhood", complete = true },
    { id = 102, title = "Red Leather Bandanas", complete = true },
    { id = 103, title = "Mail Run", complete = true },
    { id = 104, title = "Wolves Across the Border", complete = true },
    { id = 105, title = "Not Done Yet", complete = false },
    { id = 106, title = "Somewhere Unknown", complete = true },
  }`;

  function run(script: string, setup = ""): string[] {
    return runAddonLua(
      [
        ["Data.lua", addonData],
        ["TurnIns.lua", SPOTS],
        ["setup", `${STORMWIND}; ${LOG}; ${setup}`],
        ["MGADungeonQuests.lua", addonLua],
        ["load", 'fire("PLAYER_ENTERING_WORLD", false, true)'],
        ["clear", "clear()"],
        ["test", script],
      ],
      WOW_DUNGEON_QUEST_STUBS,
    );
  }
  const chat = (lines: string[]) => lines.filter((l) => l.startsWith("chat: ")).map((l) => l.replace("chat: MGA Dungeon Quests: ", ""));
  const route = (lines: string[]) => lines.find((l) => l.startsWith("route: "));

  it("pins only finished quests' turn-ins on the zone map you're looking at, one per NPC", () => {
    expect(run("openMap(1436); shownTurnInPins()")).toEqual(["turnin pin: Gryan Stoutmantle at 563 -238", "map button: Route 4 turn-ins"]);
    expect(run("openMap(1453); shownTurnInPins()")).toEqual(["turnin pin: Stormwind Clerk at 620 -350", "map button: Route 4 turn-ins"]);
    expect(run("openMap(1440); shownTurnInPins()")).toEqual(["map button: Route 4 turn-ins"]);
  });

  it("a continent map shows every turn-in the client can place on it", () => {
    const lines = run("mapTypes[1415] = 2; mapOnContinent[1436] = {0.4, 0.8}; mapOnContinent[1429] = {0.45, 0.75}; openMap(1415); shownTurnInPins()");
    expect(lines).toEqual(["turnin pin: Gryan Stoutmantle at 400 -400", "turnin pin: Marshal Dughan at 450 -375", "map button: Route 4 turn-ins"]);
  });

  it("a pin's tooltip lists what to hand in there, and clicking it routes you there", () => {
    const lines = run("openMap(1436); hoverTurnInPin(1); clickTurnInPin(1); shownRoute()");
    expect(lines.filter((l) => l.startsWith("tooltip: "))).toEqual([
      "tooltip: Gryan Stoutmantle",
      "tooltip: Westfall 56.3, 47.5 (Sentinel Hill)",
      "tooltip: Turn in: The Defias Brotherhood",
      "tooltip: Turn in: Red Leather Bandanas",
      "tooltip: Click to route here.",
    ]);
    expect(route(lines)).toMatch(/^route: Turn in at Gryan Stoutmantle \(about \d+ min\) \| 1 of /);
  });

  it("the map follows your quest log, and /mgadq pins off hides it", () => {
    const handed = run("openMap(1436); clear(); questLog = { questLog[3] }; fire('QUEST_LOG_UPDATE'); shownTurnInPins()");
    expect(handed).toEqual(["map button: Route 1 turn-in"]);
    const off = run("openMap(1436); clear(); slash('pins off'); shownTurnInPins()");
    expect(off).toEqual(["chat: MGA Dungeon Quests: World Map pins on your finished quests off.", "map button: none"]);
  });

  it("/mgadq turnin lists the stops in the quickest order and routes you to the first", () => {
    const lines = run("slash('turnin'); shownRoute()");
    const said = chat(lines);
    expect(said[0]).toBe("1 finished quest has no turn-in spot in our data: Somewhere Unknown.");
    expect(said[1]).toMatch(/^hand in 4 quests at 3 stops, about \d+ min of travel, in this order:$/);
    expect(said.slice(2, 5)).toEqual([
      // Flying out to Sentinel Hill and back beats walking to Westfall from Goldshire.
      "1. Gryan Stoutmantle, Westfall 56.3, 47.5 (Sentinel Hill): The Defias Brotherhood, Red Leather Bandanas",
      "2. Stormwind Clerk, Stormwind City 62.0, 70.0: Mail Run",
      "3. Marshal Dughan, Elwynn Forest 42.1, 65.9 (Goldshire): Wolves Across the Border",
    ]);
    expect(route(lines)).toMatch(/^route: Turn-in 1 of 3: Gryan Stoutmantle \(about \d+ min\)/);
  });

  it("on arrival it says what to hand in; once handed in it routes to the next stop, and ends after the last", () => {
    const arrived = run(`slash('turnin');
      local s = MGADungeonQuestsTravel.zones[1436];
      position = { x = s[3] - 0.475 * (s[3] - s[2]), y = s[5] - 0.563 * (s[5] - s[4]), c = s[1] };
      clear(); tickRoute(); shownRoute()`);
    expect(chat(arrived)).toContain(
      "you've reached Gryan Stoutmantle. Now hand in The Defias Brotherhood, Red Leather Bandanas to Gryan Stoutmantle.",
    );
    expect(route(arrived)).toBe("route: none");
    const HAND_IN_GRYAN = "table.remove(questLog, 1); table.remove(questLog, 1); fire('QUEST_LOG_UPDATE')";
    const half = run(`slash('turnin'); clear(); table.remove(questLog, 1); fire('QUEST_LOG_UPDATE'); shownRoute()`);
    expect(chat(half)).toEqual([]);
    expect(route(half)).toMatch(/^route: Turn-in 1 of 3: Gryan Stoutmantle/);
    const next = run(`slash('turnin'); clear(); ${HAND_IN_GRYAN}; shownRoute()`);
    expect(chat(next)[0]).toBe("next: hand in Mail Run to Stormwind Clerk.");
    expect(route(next)).toMatch(/^route: Turn-in 1 of 2: Stormwind Clerk/);
    const done = run("slash('turnin'); clear(); questLog = {}; fire('QUEST_LOG_UPDATE'); shownRoute()");
    expect(chat(done)).toEqual(["that's every quest handed in."]);
    expect(route(done)).toBe("route: none");
  });

  it("the map's button starts the run; Stop ends it; a route from the journal ends it too", () => {
    const started = run("openMap(1436); clear(); clickTurnInButton(); shownRoute()");
    expect(route(started)).toMatch(/^route: Turn-in 1 of 3/);
    const HAND_IN_GRYAN = "table.remove(questLog, 1); table.remove(questLog, 1); fire('QUEST_LOG_UPDATE')";
    const stopped = run(`slash('turnin'); clickRouteStop(); clear(); ${HAND_IN_GRYAN}; shownRoute()`);
    expect(stopped).toEqual(["route: none"]);
    const replaced = run(`slash('turnin'); MGADungeonQuests.StartRoute({ giver = 'Near', where = 'Stormwind', map = 1453, x = 66, y = 66 });
      clear(); ${HAND_IN_GRYAN}; shownRoute()`);
    expect(replaced.find((l) => l.startsWith("chat: "))).toBeUndefined();
    expect(route(replaced)).toMatch(/^route: Route to Near/);
  });

  it("a stop whose quests the game still has (under a collapsed header) isn't counted as handed in", () => {
    // Gryan's two quests drop out of the listed log, but asked by id the game says they're still there.
    const askable = "C_QuestLog.IsOnQuest = function(id) return id == 101 or id == 102 end";
    const collapsed = run(`${askable}; slash('turnin'); clear(); table.remove(questLog, 1); table.remove(questLog, 1); fire('QUEST_LOG_UPDATE'); shownRoute()`);
    expect(chat(collapsed)).toEqual([]);
    expect(route(collapsed)).toMatch(/^route: Turn-in 1 of 3: Gryan Stoutmantle/);
  });

  it("once only quests with no known spot are left it says so instead of 'every quest handed in'", () => {
    const lines = run("slash('turnin'); clear(); questLog = { questLog[6] }; fire('QUEST_LOG_UPDATE')");
    expect(chat(lines)).toEqual(["that's every turn-in we know the spot of. Still finished: Somewhere Unknown."]);
  });

  it("a stop it can't find a way to goes last, and the rest still get their best order", () => {
    const lines = run(`MGADungeonQuestsTurnIns[103] = {"Nowhere", 424242, 50, 50, "Nowhere 50.0, 50.0"}; slash('turnin')`);
    const said = chat(lines);
    expect(said[1]).toBe("hand in 4 quests at 3 stops, in this order:");
    expect(said.slice(2, 5).map((l) => l.split(",")[0])).toEqual(["1. Gryan Stoutmantle", "2. Marshal Dughan", "3. Nowhere"]);
  });

  it("a pin's route on a client without map waypoints says where instead of failing", () => {
    const lines = run("position = nil; C_Map = nil; openMap(1436); clickTurnInPin(1)");
    expect(chat(lines)).toEqual(["the map can't take a pin there. Gryan Stoutmantle is at Westfall 56.3, 47.5 (Sentinel Hill)."]);
  });

  it("says so when nothing is finished, and inside an instance it can't plan", () => {
    expect(chat(run("slash('turnin')", "questLog = {}"))).toEqual(["no finished quests in your quest log."]);
    expect(chat(run("position = nil; slash('turnin')", "questLog = { questLog[1] }"))).toEqual([
      "inside an instance the game doesn't say where you are. Try again outside; your turn-ins are pinned on the World Map.",
    ]);
  });

  it("works with the older quest log globals", () => {
    expect(run("C_QuestLog = nil; openMap(1436); shownTurnInPins()")).toEqual([
      "turnin pin: Gryan Stoutmantle at 563 -238",
      "map button: Route 4 turn-ins",
    ]);
  });
});
